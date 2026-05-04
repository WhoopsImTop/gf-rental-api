const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  resendConfirmation,
  sendCustomEmail,
} = require("../controllers/emailController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

const mailCustomSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many custom mail requests from this IP, please try again later",
});

const mailResendConfirmationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many resend requests from this IP, please try again later",
});

router.post(
  "/custom/send",
  authenticateToken,
  requireRole("ADMIN", "SELLER"),
  mailCustomSendLimiter,
  sendCustomEmail,
);
router.post(
  "/confirmation/resend/:id",
  authenticateToken,
  mailResendConfirmationLimiter,
  resendConfirmation,
);

module.exports = router;
