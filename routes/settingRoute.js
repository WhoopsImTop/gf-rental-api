const express = require("express");
const router = express.Router();
const settingController = require("../controllers/settingController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

router.get("/insurance", settingController.findInsurance);
router.get("/", authenticateToken, settingController.findSetting);
router.patch(
  "/",
  authenticateToken,
  requireRole("ADMIN"),
  settingController.updateSetting,
);

module.exports = router;
