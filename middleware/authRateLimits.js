const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function emailSubKey(req) {
  const email = req.body?.email;
  if (!email || typeof email !== "string") {
    return `missing:${req.ip}`;
  }
  return sha256Hex(email.trim().toLowerCase());
}

/** Login: 10 / 15 min / IP + 5 / 15 min / email */
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts from this IP, please try again later",
});

const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => emailSubKey(req),
  message: "Too many login attempts for this email, please try again later",
});

/** verifyOtp: same as login */
const verifyOtpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many OTP verification attempts from this IP, please try again later",
});

const verifyOtpEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => emailSubKey(req),
  message: "Too many OTP verification attempts for this email, please try again later",
});

/** requestOtp / requestPasswordReset: 20 / 60 min / IP + 5 / 60 min / email */
const mailTriggerIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Too many requests from this IP, please try again later",
});

const mailTriggerEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => emailSubKey(req),
  message: "Too many requests for this email, please try again later",
});

/** resetPassword: 10 / 15 min / IP + 5 / 15 min / email */
const resetPasswordIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset attempts from this IP, please try again later",
});

const resetPasswordEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => emailSubKey(req),
  message: "Too many password reset attempts for this email, please try again later",
});

function mfaLoginSubKey(req) {
  const token = req.body?.mfaToken;
  if (!token || typeof token !== "string") {
    return `missing:${req.ip}`;
  }
  const decoded = jwt.decode(token);
  if (decoded && decoded.userId != null) {
    return sha256Hex(`userId:${decoded.userId}`);
  }
  return sha256Hex(`token:${token}`);
}

/** verifyMfaLogin: 10 / 15 min / IP + 5 / 15 min / userId from mfaToken */
const verifyMfaLoginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many MFA login attempts from this IP, please try again later",
});

const verifyMfaLoginUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => mfaLoginSubKey(req),
  message: "Too many MFA login attempts, please try again later",
});

module.exports = {
  loginLimits: [loginIpLimiter, loginEmailLimiter],
  verifyOtpLimits: [verifyOtpIpLimiter, verifyOtpEmailLimiter],
  mailTriggerLimits: [mailTriggerIpLimiter, mailTriggerEmailLimiter],
  resetPasswordLimits: [resetPasswordIpLimiter, resetPasswordEmailLimiter],
  verifyMfaLoginLimits: [verifyMfaLoginIpLimiter, verifyMfaLoginUserLimiter],
};
