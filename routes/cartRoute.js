const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const cartController = require("../controllers/cartController");

const cartSyncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Too many cart sync requests from this IP, please try again later",
});

router.post("/sync", cartSyncLimiter, cartController.syncCart);
router.get("/:accessToken", cartController.getCart);

module.exports = router;
