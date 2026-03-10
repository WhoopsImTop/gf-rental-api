const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../../middleware/authMiddleware");
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
} = require("../../controllers/auth/AuthentificationController");

router.post("/register", registerUser);
router.post("/login", loginUser);

router.post("/cantamen/authentificate", cantamenAuth);
router.post("/cantamen/verify", verifyCantamenCredentials);

router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);

// Password reset (public)
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

// MFA login verification (public — uses mfaToken)
router.post("/verify-mfa-login", verifyMfaLogin);

// MFA setup/management (protected)
router.get("/mfa/status", authenticateToken, getMfaStatus);
router.post("/mfa/setup", authenticateToken, setupMfa);
router.post("/mfa/verify-setup", authenticateToken, verifyMfaSetup);
router.post("/mfa/disable", authenticateToken, disableMfa);

module.exports = router;
