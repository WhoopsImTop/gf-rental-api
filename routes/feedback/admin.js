const express = require("express");
const { Op } = require("sequelize");
const db = require("../../models");
const { computeSurveyStats } = require("../../services/feedback/statsService");
const {
  serializeQuestionOptions,
  parseJsonObject,
} = require("../../services/feedback/questionOptions");
const {
  normalizeRequiredIf,
  normalizeShowIf,
  normalizeGroupKey,
  validateRequiredIf,
  validateShowIf,
  validateGroupKeyContinuity,
} = require("../../services/feedback/questionConditions");

function formatQuestionForAdmin(q) {
  const json = typeof q.toJSON === "function" ? q.toJSON() : q;
  return {
    ...json,
    required_if: normalizeRequiredIf(json.required_if),
    show_if: normalizeShowIf(json.show_if),
    group_key: normalizeGroupKey(json.group_key),
  };
}

function resolveKanbanStatus(metadata) {
  const meta = parseJsonObject(metadata) || {};
  if (meta.kanban_status) return meta.kanban_status;
  if (Array.isArray(meta.flags) && meta.flags.length > 0) return "important";
  return "new";
}

const router = express.Router();

const {
  FeedbackSurvey,
  FeedbackQuestion,
  FeedbackSession,
  FeedbackAnswer,
  FeedbackTriggerRule,
  sequelize,
} = db;

async function getSurveyOr404(surveyId, res) {
  const survey = await FeedbackSurvey.findByPk(surveyId);
  if (!survey) {
    res.status(404).json({ error: "Umfrage nicht gefunden." });
    return null;
  }
  return survey;
}

async function resolveQuestionConditionsForSave(
  surveyId,
  { required_if, show_if, group_key, order_index, questionId },
) {
  const surveyQuestions = await FeedbackQuestion.findAll({
    where: { survey_id: surveyId },
    order: [["order_index", "ASC"]],
  });

  const resolvedOrderIndex = order_index;
  const ctx = {
    surveyQuestions,
    currentOrderIndex: resolvedOrderIndex,
    currentQuestionId: questionId,
  };

  if (group_key !== undefined) {
    const groupError = validateGroupKeyContinuity(
      group_key,
      surveyQuestions,
      resolvedOrderIndex,
      questionId,
    );
    if (groupError) return { error: groupError };
  }

  let requiredIfValue;
  if (required_if !== undefined) {
    const requiredError = validateRequiredIf(required_if, ctx);
    if (requiredError) return { error: requiredError };
    requiredIfValue = normalizeRequiredIf(required_if);
  }

  let showIfValue;
  if (show_if !== undefined) {
    const showError = validateShowIf(show_if, ctx);
    if (showError) return { error: showError };
    showIfValue = normalizeShowIf(show_if);
  }

  let groupKeyValue;
  if (group_key !== undefined) {
    groupKeyValue = normalizeGroupKey(group_key);
  }

  return {
    required_if: requiredIfValue,
    show_if: showIfValue,
    group_key: groupKeyValue,
  };
}

// Surveys
router.get("/surveys", async (req, res) => {
  try {
    const surveys = await FeedbackSurvey.findAll({
      order: [["createdAt", "DESC"]],
    });
    return res.json({ surveys });
  } catch (err) {
    console.error("[feedback/admin] GET /surveys:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.post("/surveys", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      return res.status(400).json({ error: "title ist erforderlich." });
    }
    const survey = await FeedbackSurvey.create({ title, description });
    return res.status(201).json({ survey });
  } catch (err) {
    console.error("[feedback/admin] POST /surveys:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.put("/surveys/:id", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    const { title, description } = req.body;
    await survey.update({
      title: title ?? survey.title,
      description: description !== undefined ? description : survey.description,
    });
    return res.json({ survey });
  } catch (err) {
    console.error("[feedback/admin] PUT /surveys/:id:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.patch("/surveys/:id/toggle", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    await survey.update({ is_active: !survey.is_active });
    return res.json({ survey });
  } catch (err) {
    console.error("[feedback/admin] PATCH /surveys/:id/toggle:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.delete("/surveys/:id", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;

    await sequelize.transaction(async (t) => {
      const sessions = await FeedbackSession.findAll({
        where: { survey_id: survey.id },
        attributes: ["id"],
        transaction: t,
      });
      const sessionIds = sessions.map((s) => s.id);

      if (sessionIds.length > 0) {
        await FeedbackAnswer.destroy({
          where: { session_id: { [Op.in]: sessionIds } },
          transaction: t,
        });
        await FeedbackSession.destroy({
          where: { id: { [Op.in]: sessionIds } },
          transaction: t,
        });
      }

      await FeedbackTriggerRule.destroy({
        where: { survey_id: survey.id },
        transaction: t,
      });
      await FeedbackQuestion.destroy({
        where: { survey_id: survey.id },
        transaction: t,
      });
      await survey.destroy({ transaction: t });
    });

    return res.json({ message: "Umfrage gelöscht." });
  } catch (err) {
    console.error("[feedback/admin] DELETE /surveys/:id:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// Questions
router.get("/surveys/:id/questions", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    const questions = await FeedbackQuestion.findAll({
      where: { survey_id: survey.id },
      order: [["order_index", "ASC"]],
    });
    return res.json({ questions: questions.map(formatQuestionForAdmin) });
  } catch (err) {
    console.error("[feedback/admin] GET questions:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.post("/surveys/:id/questions", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    const {
      question_text,
      description,
      type,
      options,
      is_required,
      required_if,
      show_if,
      group_key,
      group_label,
      order_index,
    } = req.body;
    if (!question_text || !type) {
      return res.status(400).json({ error: "question_text und type sind erforderlich." });
    }

    const resolvedOrderIndex = order_index ?? 0;
    const conditionsResult = await resolveQuestionConditionsForSave(survey.id, {
      required_if: required_if ?? null,
      show_if: show_if ?? null,
      group_key: group_key ?? null,
      order_index: resolvedOrderIndex,
      questionId: null,
    });
    if (conditionsResult.error) {
      return res.status(400).json({ error: conditionsResult.error });
    }

    const question = await FeedbackQuestion.create({
      survey_id: survey.id,
      question_text,
      description: description?.trim() || null,
      type,
      options: serializeQuestionOptions(options),
      is_required: is_required !== undefined ? is_required : true,
      required_if: conditionsResult.required_if,
      show_if: conditionsResult.show_if,
      group_key: conditionsResult.group_key,
      group_label: group_label?.trim() || null,
      order_index: resolvedOrderIndex,
    });
    return res.status(201).json({ question: formatQuestionForAdmin(question) });
  } catch (err) {
    console.error("[feedback/admin] POST questions:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.put("/questions/:id", async (req, res) => {
  try {
    const question = await FeedbackQuestion.findByPk(req.params.id);
    if (!question) {
      return res.status(404).json({ error: "Frage nicht gefunden." });
    }
    const {
      question_text,
      description,
      type,
      options,
      is_required,
      required_if,
      show_if,
      group_key,
      group_label,
      order_index,
    } = req.body;

    const resolvedOrderIndex =
      order_index !== undefined ? order_index : question.order_index;

    const conditionsResult = await resolveQuestionConditionsForSave(
      question.survey_id,
      {
        required_if: required_if !== undefined ? required_if : question.required_if,
        show_if: show_if !== undefined ? show_if : question.show_if,
        group_key: group_key !== undefined ? group_key : question.group_key,
        order_index: resolvedOrderIndex,
        questionId: question.id,
      },
    );
    if (conditionsResult.error) {
      return res.status(400).json({ error: conditionsResult.error });
    }

    await question.update({
      question_text: question_text ?? question.question_text,
      description:
        description !== undefined
          ? description?.trim() || null
          : question.description,
      type: type ?? question.type,
      options:
        options !== undefined
          ? serializeQuestionOptions(options)
          : question.options,
      is_required: is_required !== undefined ? is_required : question.is_required,
      required_if:
        required_if !== undefined
          ? conditionsResult.required_if
          : question.required_if,
      show_if:
        show_if !== undefined ? conditionsResult.show_if : question.show_if,
      group_key:
        group_key !== undefined ? conditionsResult.group_key : question.group_key,
      group_label:
        group_label !== undefined
          ? group_label?.trim() || null
          : question.group_label,
      order_index: resolvedOrderIndex,
    });
    return res.json({ question: formatQuestionForAdmin(question) });
  } catch (err) {
    console.error("[feedback/admin] PUT questions:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.delete("/questions/:id", async (req, res) => {
  try {
    const question = await FeedbackQuestion.findByPk(req.params.id);
    if (!question) {
      return res.status(404).json({ error: "Frage nicht gefunden." });
    }
    const answerCount = await FeedbackAnswer.count({
      where: { question_id: question.id },
    });
    if (answerCount > 0) {
      return res.status(400).json({
        error: "Frage kann nicht gelöscht werden, da bereits Antworten existieren.",
      });
    }
    await question.destroy();
    return res.json({ message: "Frage gelöscht." });
  } catch (err) {
    console.error("[feedback/admin] DELETE questions:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.patch("/surveys/:id/questions/reorder", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order muss ein Array von UUIDs sein." });
    }
    await sequelize.transaction(async (t) => {
      for (let i = 0; i < order.length; i++) {
        await FeedbackQuestion.update(
          { order_index: i },
          { where: { id: order[i], survey_id: survey.id }, transaction: t },
        );
      }
    });
    const questions = await FeedbackQuestion.findAll({
      where: { survey_id: survey.id },
      order: [["order_index", "ASC"]],
    });
    return res.json({ questions: questions.map(formatQuestionForAdmin) });
  } catch (err) {
    console.error("[feedback/admin] PATCH reorder:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// Trigger rules
router.get("/surveys/:id/trigger-rules", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    const triggerRules = await FeedbackTriggerRule.findAll({
      where: { survey_id: survey.id },
      order: [["createdAt", "ASC"]],
    });
    return res.json({ triggerRules });
  } catch (err) {
    console.error("[feedback/admin] GET trigger-rules:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.post("/trigger-rules", async (req, res) => {
  try {
    const {
      survey_id,
      question_id,
      operator,
      value,
      action_type,
      action_config,
    } = req.body;
    if (!survey_id || !question_id || !operator || !value || !action_type) {
      return res.status(400).json({ error: "Pflichtfelder fehlen." });
    }
    const question = await FeedbackQuestion.findOne({
      where: { id: question_id, survey_id },
    });
    if (!question) {
      return res.status(400).json({ error: "Frage gehört nicht zu dieser Umfrage." });
    }
    const rule = await FeedbackTriggerRule.create({
      survey_id,
      question_id,
      operator,
      value,
      action_type,
      action_config: parseJsonObject(action_config),
    });
    return res.status(201).json({ triggerRule: rule });
  } catch (err) {
    console.error("[feedback/admin] POST trigger-rules:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.put("/trigger-rules/:id", async (req, res) => {
  try {
    const rule = await FeedbackTriggerRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Trigger-Regel nicht gefunden." });
    }
    const fields = [
      "survey_id",
      "question_id",
      "operator",
      "value",
      "action_type",
      "action_config",
      "is_active",
    ];
    const updates = {};
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (updates.action_config !== undefined) {
      updates.action_config = parseJsonObject(updates.action_config);
    }
    await rule.update(updates);
    return res.json({ triggerRule: rule });
  } catch (err) {
    console.error("[feedback/admin] PUT trigger-rules:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.delete("/trigger-rules/:id", async (req, res) => {
  try {
    const rule = await FeedbackTriggerRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Trigger-Regel nicht gefunden." });
    }
    await rule.destroy();
    return res.json({ message: "Trigger-Regel gelöscht." });
  } catch (err) {
    console.error("[feedback/admin] DELETE trigger-rules:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.patch("/trigger-rules/:id/toggle", async (req, res) => {
  try {
    const rule = await FeedbackTriggerRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Trigger-Regel nicht gefunden." });
    }
    await rule.update({ is_active: !rule.is_active });
    return res.json({ triggerRule: rule });
  } catch (err) {
    console.error("[feedback/admin] PATCH trigger-rules toggle:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// Sessions & stats
router.get("/surveys/:id/sessions", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const where = { survey_id: survey.id };
    if (req.query.status) {
      where.status = req.query.status;
    }
    if (req.query.from || req.query.to) {
      where.submitted_at = {};
      if (req.query.from) {
        where.submitted_at[Op.gte] = new Date(req.query.from);
      }
      if (req.query.to) {
        where.submitted_at[Op.lte] = new Date(req.query.to);
      }
    }

    const { count, rows } = await FeedbackSession.findAndCountAll({
      where,
      include: [
        {
          model: FeedbackAnswer,
          as: "answers",
          include: [{ model: FeedbackQuestion }],
        },
      ],
      order: [["submitted_at", "DESC"], ["createdAt", "DESC"]],
      limit,
      offset,
    });

    const sessions = rows.map((session) => {
      const plain = session.toJSON();
      plain.kanban_status = resolveKanbanStatus(plain.metadata);
      plain.answers = (plain.answers || []).map((a) => ({
        id: a.id,
        question_id: a.question_id,
        value: a.value,
        question_text:
          a.FeedbackQuestion?.question_text || a.feedback_question?.question_text || null,
        question_type:
          a.FeedbackQuestion?.type || a.feedback_question?.type || null,
      }));
      return plain;
    });

    return res.json({
      sessions,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error("[feedback/admin] GET sessions:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.patch("/sessions/:id", async (req, res) => {
  try {
    const session = await FeedbackSession.findByPk(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session nicht gefunden." });
    }

    const allowed = ["new", "important", "archived"];
    const { kanban_status } = req.body;
    if (!kanban_status || !allowed.includes(kanban_status)) {
      return res.status(400).json({
        error: "kanban_status muss new, important oder archived sein.",
      });
    }

    const metadata = { ...(parseJsonObject(session.metadata) || {}) };
    metadata.kanban_status = kanban_status;

    await session.update({ metadata });
    await session.reload();
    const plain = session.toJSON();
    plain.kanban_status = resolveKanbanStatus(plain.metadata);

    return res.json({ session: plain });
  } catch (err) {
    console.error("[feedback/admin] PATCH /sessions/:id:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.delete("/sessions/:id", async (req, res) => {
  try {
    const session = await FeedbackSession.findByPk(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session nicht gefunden." });
    }

    await sequelize.transaction(async (t) => {
      await FeedbackAnswer.destroy({
        where: { session_id: session.id },
        transaction: t,
      });
      await session.destroy({ transaction: t });
    });

    return res.json({ deleted: true });
  } catch (err) {
    console.error("[feedback/admin] DELETE /sessions/:id:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

router.get("/surveys/:id/stats", async (req, res) => {
  try {
    const survey = await getSurveyOr404(req.params.id, res);
    if (!survey) return;
    const stats = await computeSurveyStats(survey.id);
    return res.json(stats);
  } catch (err) {
    console.error("[feedback/admin] GET stats:", err);
    return res.status(500).json({ error: "Interner Serverfehler" });
  }
});

module.exports = router;
