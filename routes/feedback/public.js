const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../../models");
const triggerEngine = require("../../services/feedback/triggerEngine");
const { parseQuestionOptions } = require("../../services/feedback/questionOptions");
const {
  normalizeRequiredIf,
  normalizeShowIf,
  normalizeGroupKey,
  isQuestionRequired,
} = require("../../services/feedback/questionConditions");

const router = express.Router();

const {
  FeedbackSurvey,
  FeedbackQuestion,
  FeedbackSession,
  FeedbackAnswer,
  sequelize,
} = db;

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Zu viele Feedback-Einreichungen. Bitte später erneut versuchen.",
});

function formatQuestion(q) {
  return {
    id: q.id,
    question_text: q.question_text,
    description: q.description || null,
    type: q.type,
    options: parseQuestionOptions(q.options),
    is_required: q.is_required,
    required_if: normalizeRequiredIf(q.required_if),
    show_if: normalizeShowIf(q.show_if),
    group_key: normalizeGroupKey(q.group_key),
    group_label: q.group_label || null,
    order_index: q.order_index,
  };
}

router.get("/survey", async (req, res) => {
  try {
    const surveyId = req.query.survey_id || req.query.survey;

    let survey;
    if (surveyId) {
      survey = await FeedbackSurvey.findOne({
        where: { id: surveyId, is_active: true },
        include: [
          {
            model: FeedbackQuestion,
            as: "questions",
            separate: true,
            order: [["order_index", "ASC"]],
          },
        ],
      });
      if (!survey) {
        return res.status(404).json({
          error: "Umfrage nicht gefunden oder nicht aktiv.",
        });
      }
    } else {
      survey = await FeedbackSurvey.findOne({
        where: { is_active: true },
        order: [["updatedAt", "DESC"]],
        include: [
          {
            model: FeedbackQuestion,
            as: "questions",
            separate: true,
            order: [["order_index", "ASC"]],
          },
        ],
      });
      if (!survey) {
        return res.status(404).json({ error: "Keine aktive Umfrage gefunden." });
      }
    }

    return res.json({
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
      },
      questions: (survey.questions || []).map(formatQuestion),
    });
  } catch (err) {
    console.error("[feedback/public] GET /survey:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.post("/submit", submitLimiter, async (req, res) => {
  try {
    const {
      survey_id,
      answers,
      external_reference_id,
      respondent_email,
      respondent_name,
    } = req.body;

    if (!survey_id || !Array.isArray(answers)) {
      return res.status(400).json({ error: "survey_id und answers sind erforderlich." });
    }

    const survey = await FeedbackSurvey.findByPk(survey_id, {
      include: [{ model: FeedbackQuestion, as: "questions" }],
    });

    if (!survey || !survey.is_active) {
      return res.status(400).json({ error: "Umfrage nicht gefunden oder nicht aktiv." });
    }

    const questions = survey.questions || [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const answerMap = new Map(answers.map((a) => [a.question_id, a.value]));

    for (const question of questions) {
      if (!isQuestionRequired(question, answerMap)) continue;
      const value = answerMap.get(question.id);
      if (value === undefined || value === null || String(value).trim() === "") {
        return res.status(400).json({
          error: `Pflichtfrage nicht beantwortet: ${question.question_text}`,
        });
      }
    }

    for (const answer of answers) {
      if (!questionMap.has(answer.question_id)) {
        return res.status(400).json({ error: "Ungültige question_id in answers." });
      }
    }

    const session = await sequelize.transaction(async (t) => {
      const newSession = await FeedbackSession.create(
        {
          survey_id,
          external_reference_id: external_reference_id || null,
          respondent_email: respondent_email || null,
          respondent_name: respondent_name || null,
          status: "completed",
          submitted_at: new Date(),
          metadata: { kanban_status: "new" },
        },
        { transaction: t },
      );

      const answerRows = answers.map((a) => ({
        session_id: newSession.id,
        question_id: a.question_id,
        value: String(a.value),
      }));

      await FeedbackAnswer.bulkCreate(answerRows, { transaction: t });
      return newSession;
    });

    setImmediate(() => {
      triggerEngine.evaluate(session.id).catch((err) => {
        console.error("[feedback/public] trigger evaluate:", err);
      });
    });

    return res.status(201).json({
      message: "Danke für dein Feedback",
      sessionId: session.id,
    });
  } catch (err) {
    console.error("[feedback/public] POST /submit:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

module.exports = router;
