const { verifyToken } = require("../services/auth/tokenService");
const db = require("../models");

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    // Session prüfen
    const session = await db.Session.findOne({ where: { token } });
    if (!session || new Date(session.expiresAt) < new Date()) {
      return res.status(403).json({ message: "Session invalid or expired" });
    }

    // User laden
    const user = await db.User.findByPk(decoded.userId, {
      attributes: ["id", "firstName", "lastName", "role"]
    });

    if (!user) {
      return res.status(403).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({ message: "Authentication failed" });
  }
}

module.exports = { authenticateToken };
