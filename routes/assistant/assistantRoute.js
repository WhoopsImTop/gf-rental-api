const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const chat = require("../../controllers/assistant/chatController");
const knowledge = require("../../controllers/assistant/knowledgeController");

// authenticateToken + requireRole("ADMIN", "SELLER") werden in app.js davor gehängt.

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => `assistant-chat:${req.user?.id ?? req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen – bitte kurz warten." },
  validate: { keyGeneratorIpFallback: false },
});

// Test-Chat
router.get("/config", chat.getConfig);
router.post("/chat", chatLimiter, chat.chat);
router.get("/conversations", chat.listConversations);
router.get("/conversations/:id", chat.getConversation);
router.delete("/conversations/:id", chat.deleteConversation);
router.post("/messages/:id/feedback", chat.saveFeedback);
router.get("/feedback", chat.listFeedback);

// Wissensbasis / Einlernen
router.get("/sources", knowledge.listSources);
router.patch("/sources/:id", knowledge.updateSource);
router.post("/sync", knowledge.startSync);
router.get("/sync/runs", knowledge.listRuns);
router.get("/sync/runs/:id", knowledge.getRun);
router.get("/index-versions", knowledge.listVersions);
router.post("/index-versions/:id/activate", knowledge.activateVersion);
router.get("/documents/:id/diff", knowledge.documentDiff);
router.get("/chunks", knowledge.listChunks);
router.post("/search", chatLimiter, knowledge.searchTest);

module.exports = router;
