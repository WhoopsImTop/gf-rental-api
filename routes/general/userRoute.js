const express = require("express");
const router = express.Router();

const { getCrmUsers, updateCrmUser } = require("../../controllers/general/usersController");

router.get("/", getCrmUsers);
router.put("/:id", updateCrmUser);

module.exports = router;