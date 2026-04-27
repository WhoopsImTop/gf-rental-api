const { verifyToken, createToken } = require("../services/auth/tokenService");
const db = require("../models");
const { logger } = require("../services/logging");

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1️⃣ JWT prüfen
    const decoded = verifyToken(token);
    if (!decoded) {
      logger("error", "Invalid or expired token");
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    // 2️⃣ DB-Session prüfen
    let session = await db.Session.findOne({ where: { token } });

    // Falls Session nicht existiert → neue Session erstellen (optional)
    if (!session) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 Tag
      session = await db.Session.create({
        token,
        userId: decoded.userId,
        expiresAt,
      });
    } else {
      // Session vorhanden → prüfen, ob abgelaufen
      if (new Date(session.expiresAt) < new Date()) {
        return res.status(403).json({ message: "Session expired" });
      }

      // Session verlängern optional (z. B. Sliding Session)
      const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      session.expiresAt = newExpiry;
      await session.save();
    }

    // 3️⃣ User laden
    const user = await db.User.findByPk(decoded.userId, {
      attributes: ["id", "firstName", "lastName", "role"],
    });

    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }

    // 4️⃣ User an Request anhängen
    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

module.exports = { authenticateToken };