/** Fields that may contain trusted HTML (e.g. CRM vehicle descriptions, email templates). */
const HTML_ALLOWED_KEYS = new Set(["description", "body_html"]);

function sanitizeString(value, { allowHtml = false } = {}) {
  if (typeof value !== "string") return value;

  let sanitized = value.trim().replace(/\u0000/g, "");

  if (!allowHtml) {
    sanitized = sanitized.replace(/[<>]/g, "");
  }

  return sanitized.replace(/javascript:/gi, "");
}

function sanitizeValue(value, key = null) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (value && typeof value === "object") {
    const sanitizedObject = Object.create(null);
    for (const objectKey of Object.keys(value)) {
      if (
        objectKey === "__proto__" ||
        objectKey === "constructor" ||
        objectKey === "prototype"
      ) {
        continue;
      }
      sanitizedObject[objectKey] = sanitizeValue(value[objectKey], objectKey);
    }
    return sanitizedObject;
  }

  return sanitizeString(value, {
    allowHtml: key != null && HTML_ALLOWED_KEYS.has(key),
  });
}

function sanitizeRequestData(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeValue(req.params);
  }

  next();
}

module.exports = { sanitizeRequestData, HTML_ALLOWED_KEYS };
