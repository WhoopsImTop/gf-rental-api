const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  requestOtp,
  verifyOtp,
  cantamenAuth,
  verifyCantamenCredentials,
} = require("../../controllers/auth/AuthentificationController");

router.post("/register", registerUser);
router.post("/login", loginUser);

router.post("/cantamen/authentificate", cantamenAuth);
router.post("/cantamen/verify", verifyCantamenCredentials);

router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);

module.exports = router;
