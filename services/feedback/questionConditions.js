const { matchesRule } = require("./triggerEngine");
const { parseJsonObject } = require("./questionOptions");

const VALID_OPERATORS = ["equals", "contains", "lte", "gte", "not_equals"];

function normalizeRequiredIf(raw) {
  if (raw == null || raw === "") return null;
  const parsed = parseJsonObject(raw);
  if (!parsed?.question_id) return null;
  return {
    question_id: String(parsed.question_id),
    operator: String(parsed.operator || "equals"),
    value: String(parsed.value ?? ""),
  };
}

function isQuestionRequired(question, answerMap) {
  const requiredIf = normalizeRequiredIf(question.required_if);
  if (requiredIf?.question_id) {
    const ref = answerMap.get(requiredIf.question_id);
    return matchesRule(ref, requiredIf);
  }
  return Boolean(question.is_required);
}

function validateRequiredIf(requiredIfRaw, { surveyQuestions, currentOrderIndex, currentQuestionId }) {
  const requiredIf = normalizeRequiredIf(requiredIfRaw);
  if (!requiredIf) {
    if (requiredIfRaw != null && requiredIfRaw !== "") {
      return "required_if ist ungültig.";
    }
    return null;
  }

  const { question_id, operator, value } = requiredIf;

  if (!VALID_OPERATORS.includes(operator)) {
    return "Ungültiger Operator in required_if.";
  }

  if (value.trim() === "") {
    return "required_if.value ist erforderlich.";
  }

  if (currentQuestionId && question_id === currentQuestionId) {
    return "required_if darf nicht auf die gleiche Frage verweisen.";
  }

  const refQuestion = surveyQuestions.find((q) => q.id === question_id);
  if (!refQuestion) {
    return "Referenzierte Frage in required_if nicht gefunden.";
  }

  if (refQuestion.order_index >= currentOrderIndex) {
    return "required_if darf nur auf eine frühere Frage verweisen.";
  }

  return null;
}

module.exports = {
  VALID_OPERATORS,
  normalizeRequiredIf,
  isQuestionRequired,
  validateRequiredIf,
};
