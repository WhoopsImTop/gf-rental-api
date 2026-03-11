const express = require("express");
const router = express.Router();
const {
    sendContactInquiry
} = require("../../controllers/website/contactController");

router.post("/", sendContactInquiry);

module.exports = router;
