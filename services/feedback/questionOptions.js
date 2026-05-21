const {
  LIST_SEPARATOR,
  splitSemicolonList,
  joinSemicolonList,
} = require("./listUtils");

/**
 * MariaDB/MySQL liefert JSON-Spalten oft als String — einheitlich als Array behandeln.
 */
function parseQuestionOptions(raw) {
  if (raw == null || raw === "") return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return parsed;
      if (typeof parsed === "string") {
        try {
          const twice = JSON.parse(parsed);
          if (Array.isArray(twice)) return twice;
          if (twice && typeof twice === "object") return twice;
        } catch {
          /* ignore */
        }
      }
    } catch {
      return splitSemicolonList(raw);
    }
  }
  return null;
}

function serializeQuestionOptions(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  const parsed = parseQuestionOptions(value);
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    return parsed.length > 0 ? parsed : null;
  }
  return parsed;
}

function parseJsonObject(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}

const {
  parseScaleConfig,
  buildScaleOptions,
  scaleConfigLabel,
} = require("./scaleConfig");

module.exports = {
  ...require("./listUtils"),
  parseQuestionOptions,
  serializeQuestionOptions,
  parseJsonObject,
  parseScaleConfig,
  buildScaleOptions,
  scaleConfigLabel,
};
