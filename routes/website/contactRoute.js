const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
    sendContactInquiry
} = require("../../controllers/website/contactController");

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many contact requests from this IP, please try again later",
});

router.post("/", contactLimiter, sendContactInquiry);

module.exports = router;
