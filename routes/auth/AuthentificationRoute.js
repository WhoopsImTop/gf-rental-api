const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/authMiddleware");
const {
  loginLimits,
  verifyOtpLimits,
  mailTriggerLimits,
  resetPasswordLimits,
  verifyMfaLoginLimits,
} = require("../../middleware/authRateLimits");
const {
  registerUser,
  loginUser,
  requestOtp,
  verifyOtp,
  cantamenAuth,
  verifyCantamenCredentials,
  requestPasswordReset,
  resetPassword,
  setupMfa,
  verifyMfaSetup,
  verifyMfaLogin,
  disableMfa,
  getMfaStatus,
  getCurrentUser,
  logoutUser,
} = require("../../controllers/auth/AuthentificationController");

router.post("/register", registerUser);
router.post("/login", ...loginLimits, loginUser);

router.post("/cantamen/authentificate", cantamenAuth);
router.post("/cantamen/verify", verifyCantamenCredentials);

router.post("/request-otp", ...mailTriggerLimits, requestOtp);
router.post("/verify-otp", ...verifyOtpLimits, verifyOtp);

// Password reset (public)
router.post("/request-password-reset", ...mailTriggerLimits, requestPasswordReset);
router.post("/reset-password", ...resetPasswordLimits, resetPassword);

// MFA login verification (public — uses mfaToken)
router.post("/verify-mfa-login", ...verifyMfaLoginLimits, verifyMfaLogin);
router.get("/me", authenticateToken, getCurrentUser);
router.post("/logout", authenticateToken, logoutUser);

// MFA setup/management (protected)
router.get("/mfa/status", authenticateToken, getMfaStatus);
router.post("/mfa/setup", authenticateToken, setupMfa);
router.post("/mfa/verify-setup", authenticateToken, verifyMfaSetup);
router.post("/mfa/disable", authenticateToken, disableMfa);

module.exports = router;
