const jwt = require("jsonwebtoken");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET missing");
}

const secretKey = process.env.JWT_SECRET;
const tokenExpiry = process.env.JWT_EXPIRATION || "1d";
const MFA_TOKEN_EXPIRY = "5m";

function createToken(payload, expiresIn = tokenExpiry) {
  return jwt.sign(payload, secretKey, { expiresIn });
}

function createMfaToken(payload) {
  return createToken({ ...payload, purpose: "mfa" }, MFA_TOKEN_EXPIRY);
}

function verifyToken(token) {
  try {
    return jwt.verify(token, secretKey);
  } catch (error) {
    return null;
  }
}

module.exports = { createToken, createMfaToken, verifyToken, MFA_TOKEN_EXPIRY };
