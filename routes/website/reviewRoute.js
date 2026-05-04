const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  createReview,
  findAllReviews,
  deleteReview,
} = require("../../controllers/website/reviewController");
const { authenticateToken } = require("../../middleware/authMiddleware");
const { requireRole } = require("../../middleware/requireRole");

const reviewCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1,
  message: "Too many review submissions from this IP, please try again later",
});

router.post("/", reviewCreateLimiter, createReview);
router.get("/", findAllReviews);
router.delete(
  "/:id",
  authenticateToken,
  requireRole("ADMIN", "SELLER"),
  deleteReview,
);

module.exports = router;
