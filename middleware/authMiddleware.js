const { verifyToken } = require("../services/auth/tokenService");
const db = require("../models");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token missing" });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(403).json({ message: "Invalid or expired token" });

  // Überprüfe die Session in der Datenbank
  const session = await db.Session.findOne({ where: { token } });
  if (!session || new Date(session.expiresAt) < new Date()) {
    return res.status(403).json({ message: "Session invalid or expired" });
  }

  let userId = decoded.userId;

  const { id, firstName, lastName, role } = await db.User.findOne({ where: { id: userId } });
  req.user = { id, firstName, lastName, role };

  next();
}

module.exports = authenticateToken;
