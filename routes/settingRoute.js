const express = require("express");
const router = express.Router();
const settingController = require("../controllers/settingController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/insurance", settingController.findInsurance);
router.get("/", authenticateToken, settingController.findSetting);
router.patch("/", authenticateToken, settingController.updateSetting);

module.exports = router;
