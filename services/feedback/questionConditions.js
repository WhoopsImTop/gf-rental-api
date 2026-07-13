const { matchesRule } = require("./triggerEngine");
const { parseJsonObject } = require("./questionOptions");

const VALID_OPERATORS = ["equals", "contains", "lte", "gte", "not_equals"];

function normalizeCondition(raw) {
  if (raw == null || raw === "") return null;
  const parsed = parseJsonObject(raw);
  if (!parsed?.question_id) return null;
  return {
    question_id: String(parsed.question_id),
    operator: String(parsed.operator || "equals"),
    value: String(parsed.value ?? ""),
  };
}

function normalizeRequiredIf(raw) {
  return normalizeCondition(raw);
}

function normalizeShowIf(raw) {
  return normalizeCondition(raw);
}

function normalizeGroupKey(raw) {
  if (raw == null || raw === "") return null;
  const key = String(raw).trim();
  return key || null;
}

function isQuestionVisible(question, answerMap) {
  const showIf = normalizeShowIf(question.show_if);
  if (!showIf?.question_id) return true;
  const ref = answerMap.get(showIf.question_id);
  return matchesRule(ref, showIf);
}

function isQuestionRequired(question, answerMap) {
  if (!isQuestionVisible(question, answerMap)) return false;

  const requiredIf = normalizeRequiredIf(question.required_if);
  if (requiredIf?.question_id) {
    const ref = answerMap.get(requiredIf.question_id);
    return matchesRule(ref, requiredIf);
  }
  return Boolean(question.is_required);
}

function validateCondition(
  conditionRaw,
  fieldLabel,
  { surveyQuestions, currentOrderIndex, currentQuestionId },
) {
  const condition = normalizeCondition(conditionRaw);
  if (!condition) {
    if (conditionRaw != null && conditionRaw !== "") {
      return `${fieldLabel} ist ungültig.`;
    }
    return null;
  }

  const { question_id, operator, value } = condition;

  if (!VALID_OPERATORS.includes(operator)) {
    return `Ungültiger Operator in ${fieldLabel}.`;
  }

  if (value.trim() === "") {
    return `${fieldLabel}.value ist erforderlich.`;
  }

  if (currentQuestionId && question_id === currentQuestionId) {
    return `${fieldLabel} darf nicht auf die gleiche Frage verweisen.`;
  }

  const refQuestion = surveyQuestions.find((q) => q.id === question_id);
  if (!refQuestion) {
    return `Referenzierte Frage in ${fieldLabel} nicht gefunden.`;
  }

  if (refQuestion.order_index >= currentOrderIndex) {
    return `${fieldLabel} darf nur auf eine frühere Frage verweisen.`;
  }

  return null;
}

function validateRequiredIf(requiredIfRaw, { surveyQuestions, currentOrderIndex, currentQuestionId }) {
  return validateCondition(requiredIfRaw, "required_if", {
    surveyQuestions,
    currentOrderIndex,
    currentQuestionId,
  });
}

function validateShowIf(showIfRaw, { surveyQuestions, currentOrderIndex, currentQuestionId }) {
  return validateCondition(showIfRaw, "show_if", {
    surveyQuestions,
    currentOrderIndex,
    currentQuestionId,
  });
}

function validateGroupKeyContinuity(groupKey, surveyQuestions, currentOrderIndex, currentQuestionId) {
  const key = normalizeGroupKey(groupKey);
  if (!key) return null;

  const grouped = surveyQuestions
    .filter((q) => normalizeGroupKey(q.group_key) === key)
    .map((q) => ({
      id: q.id,
      order_index: q.id === currentQuestionId ? currentOrderIndex : q.order_index,
    }));

  if (!grouped.length) return null;

  const indices = [...new Set(grouped.map((q) => q.order_index))].sort((a, b) => a - b);
  const min = indices[0];
  const max = indices[indices.length - 1];
  if (max - min + 1 !== indices.length) {
    return "Fragen mit gleichem group_key müssen aufeinanderfolgende order_index-Werte haben.";
  }

  return null;
}

function buildQuestionSteps(questions) {
  const sorted = [...questions].sort((a, b) => a.order_index - b.order_index);
  const steps = [];
  let currentKey = null;
  let currentStep = [];

  for (const q of sorted) {
    const stepKey = normalizeGroupKey(q.group_key) || q.id;
    if (stepKey !== currentKey) {
      if (currentStep.length) steps.push(currentStep);
      currentStep = [q];
      currentKey = stepKey;
    } else {
      currentStep.push(q);
    }
  }

  if (currentStep.length) steps.push(currentStep);
  return steps;
}

function getStepLabel(stepQuestions) {
  for (const q of stepQuestions) {
    const label = q.group_label?.trim();
    if (label) return label;
  }
  return null;
}

module.exports = {
  VALID_OPERATORS,
  normalizeCondition,
  normalizeRequiredIf,
  normalizeShowIf,
  normalizeGroupKey,
  isQuestionVisible,
  isQuestionRequired,
  validateRequiredIf,
  validateShowIf,
  validateGroupKeyContinuity,
  buildQuestionSteps,
  getStepLabel,
};
