const express = require("express");
const router = express.Router();

const { getCrmUsers } = require("../../controllers/general/usersController");

router.get("/", getCrmUsers);

module.exports = router;