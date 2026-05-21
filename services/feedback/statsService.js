const db = require("../../models");
const { Op } = require("sequelize");
const { parseQuestionOptions } = require("./questionOptions");

const { FeedbackQuestion, FeedbackAnswer, FeedbackSession } = db;

function parseMultiChoiceValue(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return [value];
}

async function computeSurveyStats(surveyId) {
  const questions = await FeedbackQuestion.findAll({
    where: { survey_id: surveyId },
    order: [["order_index", "ASC"]],
  });

  const completedSessions = await FeedbackSession.findAll({
    where: { survey_id: surveyId, status: "completed" },
    attributes: ["id"],
  });
  const sessionIds = completedSessions.map((s) => s.id);

  if (sessionIds.length === 0) {
    return {
      totalSessions: 0,
      questions: questions.map((q) => ({
        questionId: q.id,
        questionText: q.question_text,
        type: q.type,
        data: getEmptyStatsForType(q.type),
      })),
    };
  }

  const answers = await FeedbackAnswer.findAll({
    where: { session_id: { [Op.in]: sessionIds } },
  });

  const answersByQuestion = {};
  for (const answer of answers) {
    if (!answersByQuestion[answer.question_id]) {
      answersByQuestion[answer.question_id] = [];
    }
    answersByQuestion[answer.question_id].push(answer.value);
  }

  const questionStats = questions.map((q) => {
    const values = answersByQuestion[q.id] || [];
    return {
      questionId: q.id,
      questionText: q.question_text,
      type: q.type,
      data: aggregateByType(q.type, q.options, values),
    };
  });

  return {
    totalSessions: sessionIds.length,
    questions: questionStats,
  };
}

function getEmptyStatsForType(type) {
  switch (type) {
    case "single_choice":
    case "multi_choice":
      return { counts: {} };
    case "rating":
    case "nps":
      return { average: null, distribution: {} };
    case "text":
      return { texts: [] };
    default:
      return {};
  }
}

function aggregateByType(type, options, values) {
  switch (type) {
    case "single_choice": {
      const counts = {};
      const opts = parseQuestionOptions(options) || [];
      for (const opt of opts) counts[opt] = 0;
      for (const v of values) {
        counts[v] = (counts[v] || 0) + 1;
      }
      return { counts };
    }
    case "multi_choice": {
      const counts = {};
      const opts = parseQuestionOptions(options) || [];
      for (const opt of opts) counts[opt] = 0;
      for (const v of values) {
        for (const item of parseMultiChoiceValue(v)) {
          counts[item] = (counts[item] || 0) + 1;
        }
      }
      return { counts };
    }
    case "rating":
    case "nps": {
      const distribution = {};
      const nums = values
        .map((v) => parseFloat(v))
        .filter((n) => !Number.isNaN(n));
      for (const n of nums) {
        const key = String(n);
        distribution[key] = (distribution[key] || 0) + 1;
      }
      const average =
        nums.length > 0
          ? nums.reduce((a, b) => a + b, 0) / nums.length
          : null;
      return { average, distribution };
    }
    case "text":
      return {
        texts: values
          .map((v) => String(v ?? "").trim())
          .filter((v) => v.length > 0),
      };
    default:
      return {};
  }
}

module.exports = { computeSurveyStats };
