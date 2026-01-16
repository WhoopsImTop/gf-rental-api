const express = require("express");
const router = express.Router();
const settingController= require("../controllers/settingController");

router.get("/", settingController.findSetting);
router.patch("/", settingController.updateSetting);

module.exports = router;
