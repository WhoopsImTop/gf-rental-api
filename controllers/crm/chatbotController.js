const db = require("../../models");
const { Op } = require("sequelize");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

const { FeedbackSurvey, FeedbackQuestion, FeedbackSession, FeedbackAnswer } = db;

const { resolveExportColumns } = require("../../services/feedback/csvExport");
const mailService = require("../../services/mailService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAnswerValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const SUMMARY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSummaryDateRange(from, to) {
  if (!from && !to) return { fromDate: null, toDate: null };
  if (!SUMMARY_DATE_RE.test(from || "") || !SUMMARY_DATE_RE.test(to || "")) {
    return { error: "from und to müssen im Format YYYY-MM-DD angegeben werden." };
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return { error: "Ungültiger Zeitraum." };
  }
  return { fromDate, toDate };
}

/**
 * Erstellt per KI eine Zusammenfassung aller (im Zeitraum eingegangenen,
 * abgeschlossenen) Feedback-Antworten einer Umfrage und verschickt sie
 * per Email an die angegebene Adresse. Wird vom "Zusammenfassung senden"
 * Button je Umfrage im CRM ausgeloest.
 */
exports.sendFeedbackSummaryEmail = async (req, res) => {
  const { surveyId } = req.params;
  const { email, from, to } = req.body || {};

  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "Bitte eine gueltige Email-Adresse angeben." });
  }

  const range = parseSummaryDateRange(from, to);
  if (range.error) {
    return res.status(400).json({ error: range.error });
  }

  try {
    const survey = await FeedbackSurvey.findByPk(surveyId);
    if (!survey) {
      return res.status(404).json({ error: "Umfrage nicht gefunden." });
    }

    const questions = await FeedbackQuestion.findAll({
      where: { survey_id: surveyId },
      order: [["order_index", "ASC"]],
    });

    const exportColumns = resolveExportColumns(questions, null);

    const sessionWhere = { survey_id: surveyId, status: "completed" };
    if (range.fromDate && range.toDate) {
      sessionWhere.submitted_at = { [Op.gte]: range.fromDate, [Op.lte]: range.toDate };
    }

    const sessions = await FeedbackSession.findAll({
      where: sessionWhere,
      include: [{ model: FeedbackAnswer, as: "answers" }],
      order: [
        ["submitted_at", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    if (sessions.length === 0) {
      return res.status(422).json({
        error: "Fuer diese Umfrage (und diesen Zeitraum) liegen keine abgeschlossenen Einreichungen vor.",
      });
    }

    const dataForAI = {
      survey: { title: survey.title, description: survey.description || undefined },
      questions: exportColumns
        .filter((column) => column.questionId)
        .map((column) => ({ id: column.key, text: column.header })),
      responses: sessions.map((session) => {
        const sessionJson = session.toJSON();
        return {
          sessionId: sessionJson.id,
          submittedAt: sessionJson.submitted_at,
          answers: Object.fromEntries(
            (sessionJson.answers || []).map((answer) => [
              `q_${answer.question_id}`,
              parseAnswerValue(answer.value),
            ]),
          ),
        };
      }),
    };

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions:
        "Du bist ein Datenanalyst der Gruenen Flotte. Fasse das gegebene Feedback zusammen und verfasse eine sauber strukturierte Email mit einer Zusammenfassung aller Feedbacks (Kernaussagen, Stimmungsbild, auffaellige Einzelmeinungen). Wenn dir etwas besonders erwaehnenswertes auffaellt, ergaenze es als Extrapunkt. Gib ausschliesslich den HTML-Inhalt fuer den Email-Body zurueck (nutze <p>, <ul>, <li>, <strong> - keine <html>/<head>/<body> Tags), auf Deutsch. Du kannst auch Grafiken oder Diagramme mit HTML einbinden wenn es der übersichtlichkeit dient.",
      input: JSON.stringify(dataForAI, null, 2),
    });

    const summaryHtml = response.output_text;
    const subject = `Feedback-Zusammenfassung: ${survey.title}`;
    const emailHtml = mailService.generateEmailHtml(subject, summaryHtml);

    await mailService.sendNotificationEmail(email.trim(), null, subject, emailHtml, null, {
      mailType: "feedback",
    });

    return res.json({ success: true, sessionCount: sessions.length });
  } catch (err) {
    console.error("Fehler beim Versenden der Feedback-Zusammenfassung:", err);
    return res.status(500).json({ error: "Zusammenfassung konnte nicht erstellt/versendet werden." });
  }
};
