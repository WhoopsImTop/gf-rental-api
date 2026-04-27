const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  subscribeToNewsletter,
} = require("../../controllers/website/newsletterController");

const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Too many newsletter requests from this IP, please try again later",
});

router.post("/subscribe", newsletterLimiter, subscribeToNewsletter);

module.exports = router;
