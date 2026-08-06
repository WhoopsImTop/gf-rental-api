const { verifyToken, createToken } = require("../services/auth/tokenService");
const {
  SESSION_MAX_AGE_MS,
  JWT_REFRESH_THRESHOLD_MS,
  setAuthCookie,
  getAuthTokenFromRequest,
} = require("../services/auth/authCookie");
const db = require("../models");
const { logSecurityEvent } = require("../services/audit/securityAudit");

/**
 * JWT string rotation is intentionally limited to GET /auth/me (CRM heartbeat).
 * Rotating on every authenticated request races with parallel uploads/API calls:
 * request B still carries the old cookie after A already replaced the DB token → 401.
 */
function isSessionRefreshRoute(req) {
  const base = typeof req.baseUrl === "string" ? req.baseUrl : "";
  const path = typeof req.path === "string" ? req.path : "";
  if (req.method === "GET" && base.endsWith("/auth") && path === "/me") {
    return true;
  }
  const original =
    typeof req.originalUrl === "string" ? req.originalUrl.split("?")[0] : "";
  return req.method === "GET" && /\/auth\/me\/?$/.test(original);
}

async function authenticateToken(req, res, next) {
  try {
    const token = getAuthTokenFromRequest(req);

    if (!token) {
      logSecurityEvent({
        req,
        action: "auth_jwt",
        outcome: "no_credentials",
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

    // 3️⃣ User laden
    const user = await db.User.findByPk(decoded.userId, {
      attributes: ["id", "firstName", "lastName", "role"],
    });

    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }

    const newExpiry = new Date(Date.now() + SESSION_MAX_AGE_MS);
    let activeToken = token;

    const jwtExpiresAtMs = decoded.exp ? decoded.exp * 1000 : 0;
    const remainingMs = jwtExpiresAtMs - Date.now();
    const needsJwtRefresh =
      isSessionRefreshRoute(req) &&
      (!jwtExpiresAtMs || remainingMs < JWT_REFRESH_THRESHOLD_MS);

    if (needsJwtRefresh) {
      const refreshedToken = createToken({
        userId: user.id,
        role: user.role,
      });
      const [affected] = await db.Session.update(
        { token: refreshedToken, expiresAt: newExpiry },
        { where: { id: session.id, token } },
      );

      if (affected === 1) {
        activeToken = refreshedToken;
      } else {
        // Parallel /auth/me already rotated — adopt winner so this heartbeat still succeeds.
        const fresh = await db.Session.findByPk(session.id);
        if (!fresh || new Date(fresh.expiresAt) < new Date()) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        activeToken = fresh.token;
      }
    } else {
      // Same token: slide DB expiry + cookie maxAge without invalidating in-flight requests.
      session.expiresAt = newExpiry;
      await session.save();
    }

    setAuthCookie(res, activeToken);

    // 4️⃣ User an Request anhängen
    req.authToken = activeToken;
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

module.exports = { authenticateToken };
