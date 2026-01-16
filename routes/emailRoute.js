const express = require("express");
const router = express.Router();
const {
  resendConfirmation,
  sendCustomEmail,
} = require("../controllers/emailController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.post("/custom/send", authenticateToken, sendCustomEmail);
router.post("/confirmation/resend/:id", authenticateToken, resendConfirmation);

module.exports = router;
