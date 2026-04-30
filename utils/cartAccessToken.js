"use strict";

const crypto = require("crypto");

const TOKEN_RE = /^[a-f0-9]{64}$/i;

function normalizeCartAccessToken(raw) {
  if (!raw || typeof raw !== "string") return "";
  const t = raw.trim();
  if (!TOKEN_RE.test(t)) return "";
  return t.toLowerCase();
}

function hashCartAccessTokenForLog(token) {
  if (!token) return undefined;
  return crypto.createHash("sha256").update(token, "utf8").digest("hex").slice(0, 16);
}

module.exports = { normalizeCartAccessToken, hashCartAccessTokenForLog };
