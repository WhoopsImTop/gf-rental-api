function sanitizeString(value) {
  if (typeof value !== "string") return value;

  return value
    .trim()
    .replace(/\u0000/g, "")
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "");
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    const sanitizedObject = {};
    for (const key of Object.keys(value)) {
      sanitizedObject[key] = sanitizeValue(value[key]);
    }
    return sanitizedObject;
  }

  return sanitizeString(value);
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

module.exports = { sanitizeRequestData };
