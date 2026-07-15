const db = require("../../models");
const { sendNotificationEmail } = require("../mailService");
const { parseJsonObject } = require("./questionOptions");

const {
  FeedbackSession,
  FeedbackAnswer,
  FeedbackQuestion,
  FeedbackTriggerRule,
} = db;

function matchesRule(answerValue, rule) {
  const answer = String(answerValue ?? "");
  const ruleValue = String(rule.value ?? "");

  switch (rule.operator) {
    case "equals":
      return answer === ruleValue;
    case "contains":
      return answer.toLowerCase().includes(ruleValue.toLowerCase());
    case "lte":
      return parseFloat(answer) <= parseFloat(ruleValue);
    case "gte":
      return parseFloat(answer) >= parseFloat(ruleValue);
    case "not_equals":
      return answer !== ruleValue;
    default:
      return false;
  }
}

function buildTriggerEmailBody(session, answers) {
  const lines = [
    `Session: ${session.id}`,
    session.external_reference_id
      ? `Referenz: ${session.external_reference_id}`
      : null,
    session.respondent_email ? `E-Mail: ${session.respondent_email}` : null,
    session.respondent_name ? `Name: ${session.respondent_name}` : null,
    "",
    "Antworten:",
  ].filter(Boolean);

  for (const answer of answers) {
    const q = answer.FeedbackQuestion;
    const label = q ? q.question_text : answer.question_id;
    lines.push(`- ${label}: ${answer.value}`);
  }

  return lines.join("\n");
}

async function executeEmailAction(rule, session, answers) {
  const config = rule.action_config || {};
  const to = config.to;
  const subject = config.subject || "Feedback-Trigger ausgelöst";

  if (!to) {
    throw new Error("action_config.to fehlt für email-Trigger");
  }

  const body = buildTriggerEmailBody(session, answers);
  await sendNotificationEmail(to, null, subject, body, null, {
    plainText: body,
    mailType: "feedback",
  });
}

async function executeSlackAction(rule, session, answers) {
  const config = rule.action_config || {};
  const webhookUrl = config.webhook_url;

  if (!webhookUrl) {
    throw new Error("action_config.webhook_url fehlt für slack-Trigger");
  }

  const text = buildTriggerEmailBody(session, answers);
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed: ${response.status}`);
  }
}

async function executeDbFlagAction(rule, session) {
  const metadata = { ...(parseJsonObject(session.metadata) || {}) };
  const flags = Array.isArray(metadata.flags) ? [...metadata.flags] : [];
  const flagValue = rule.value || rule.id;
  if (!flags.includes(flagValue)) {
    flags.push(flagValue);
  }
  metadata.flags = flags;
  metadata.kanban_status = "important";
  await session.update({ metadata });
}

async function executeAction(rule, session, answers) {
  switch (rule.action_type) {
    case "email":
      await executeEmailAction(rule, session, answers);
      break;
    case "slack":
      await executeSlackAction(rule, session, answers);
      break;
    case "db_flag":
      await executeDbFlagAction(rule, session);
      break;
    default:
      throw new Error(`Unbekannter action_type: ${rule.action_type}`);
  }
}

async function evaluate(sessionId) {
  const triggered = [];

  try {
    const session = await FeedbackSession.findByPk(sessionId, {
      include: [
        {
          model: FeedbackAnswer,
          as: "answers",
          include: [{ model: FeedbackQuestion }],
        },
      ],
    });

    if (!session) {
      return triggered;
    }

    const rules = await FeedbackTriggerRule.findAll({
      where: { survey_id: session.survey_id, is_active: true },
    });

    const answers = session.answers || [];

    for (const rule of rules) {
      const matchingAnswers = answers.filter(
        (a) => a.question_id === rule.question_id,
      );

      for (const answer of matchingAnswers) {
        if (!matchesRule(answer.value, rule)) {
          continue;
        }

        try {
          await executeAction(rule, session, answers);
          triggered.push({
            ruleId: rule.id,
            actionType: rule.action_type,
            questionId: rule.question_id,
          });
        } catch (err) {
          console.error(
            `[triggerEngine] Aktion fehlgeschlagen (rule ${rule.id}):`,
            err,
          );
        }
      }
    }
  } catch (err) {
    console.error("[triggerEngine] evaluate fehlgeschlagen:", err);
  }

  return triggered;
}

module.exports = { evaluate, matchesRule };
