"use strict";

const { hashCartAccessTokenForLog } = require("../../utils/cartAccessToken");
const fs = require("fs");

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff && typeof xff === "string") {
    return xff.split(",")[0]?.trim() || null;
  }
  return req.socket?.remoteAddress || null;
}

function logSecurityEvent({ req, action, outcome, accessToken, extra = {} }) {
  const line = JSON.stringify({
    type: "security_audit",
    ts: new Date().toISOString(),
    action,
    outcome,
    ip: clientIp(req),
    userAgent: req.headers["user-agent"] || null,
    accessTokenHash: hashCartAccessTokenForLog(accessToken),
    ...extra,
  });

  //write async to log to log folder
  fs.appendFile("logs/security_audit.log", line + "\n", (err) => {
    if (err) {
      console.error("Failed to write log:", err);
    }
  });
}

module.exports = { logSecurityEvent, clientIp };
