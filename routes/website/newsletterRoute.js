const express = require("express");
const router = express.Router();
const {
  subscribeToNewsletter,
} = require("../../controllers/website/newsletterController");

router.post("/subscribe", subscribeToNewsletter);

module.exports = router;
