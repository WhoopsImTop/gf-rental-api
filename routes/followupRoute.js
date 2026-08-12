"use strict";

const express = require("express");
const router = express.Router();
const {
  listFollowupJobs,
  cancelFollowupJob,
  listFollowupRules,
  getFollowupRuleById,
  createFollowupRule,
  updateFollowupRule,
} = require("../controllers/followupController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

router.get("/jobs", authenticateToken, requireRole("ADMIN"), listFollowupJobs);
router.delete(
  "/jobs/:id",
  authenticateToken,
  requireRole("ADMIN"),
  cancelFollowupJob,
);
router.get("/rules", authenticateToken, requireRole("ADMIN"), listFollowupRules);
router.get(
  "/rules/:id",
  authenticateToken,
  requireRole("ADMIN"),
  getFollowupRuleById,
);
router.post(
  "/rules",
  authenticateToken,
  requireRole("ADMIN"),
  createFollowupRule,
);
router.put(
  "/rules/:id",
  authenticateToken,
  requireRole("ADMIN"),
  updateFollowupRule,
);

module.exports = router;
