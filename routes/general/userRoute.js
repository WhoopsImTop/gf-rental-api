const express = require("express");
const router = express.Router();

const { getCrmUsers, updateCrmUser } = require("../../controllers/general/usersController");
const { requireRole } = require("../../middleware/requireRole");

router.get("/", requireRole("ADMIN", "SELLER"), getCrmUsers);
router.put("/:id", requireRole("ADMIN", "SELLER"), updateCrmUser);

module.exports = router;