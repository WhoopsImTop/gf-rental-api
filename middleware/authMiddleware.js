const { verifyToken } = require("../services/auth/tokenService");
const db = require("../models");
const { logger } = require("../services/logging");
const { logSecurityEvent } = require("../services/audit/securityAudit");

function getCookieValue(cookieHeader, key) {
  if (!cookieHeader || typeof cookieHeader !== "string") return null;
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");
    if (rawName === key) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }
  return null;
}

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.split(" ")[1];
    const cookieToken = getCookieValue(req.headers.cookie, "gf_crm_session");
    const token = bearerToken || cookieToken;

    if (!token) {
      logSecurityEvent({
        req,
        action: "auth_jwt",
        outcome: "no_bearer_token",
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1️⃣ JWT prüfen
    const decoded = verifyToken(token);
    if (!decoded) {
      logSecurityEvent({
        req,
        action: "auth_jwt",
        outcome: "invalid_jwt",
      });
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    // 2️⃣ DB-Session prüfen (keine automatische Session-Erstellung)
    const session = await db.Session.findOne({ where: { token } });

    if (!session) {
      logSecurityEvent({
        req,
        action: "auth_jwt",
        outcome: "no_session",
        extra: { userId: decoded.userId },
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (new Date(session.expiresAt) < new Date()) {
      logSecurityEvent({
        req,
        action: "auth_jwt",
        outcome: "session_expired",
        extra: { userId: decoded.userId },
      });
      return res.status(403).json({ message: "Session expired" });
    }

    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    session.expiresAt = newExpiry;
    await session.save();

    // 3️⃣ User laden
    const user = await db.User.findByPk(decoded.userId, {
      attributes: ["id", "firstName", "lastName", "role"],
    });

    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }

    // 4️⃣ User an Request anhängen
    req.authToken = token;
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

module.exports = { authenticateToken };