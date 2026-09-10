const express = require("express");
const router = express.Router();
const { sendFeedbackSummaryEmail } = require("../../controllers/crm/chatbotController");
const { authenticateToken } = require("../../middleware/authMiddleware");
const { requireRole } = require("../../middleware/requireRole");

// KI-Zusammenfassung einer Feedback-Umfrage per Email versenden.
router.post(
  "/feedback/:surveyId/summary-email",
  authenticateToken,
  requireRole("ADMIN", "SELLER"),
  sendFeedbackSummaryEmail,
);

module.exports = router;
