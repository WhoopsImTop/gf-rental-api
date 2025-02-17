const express = require("express");
const router = express.Router();
const {
  createReview,
  findAllReviews,
  deleteReview,
} = require("../../controllers/website/reviewController");

router.post("/", createReview);
router.get("/", findAllReviews);
router.post("/:id", deleteReview);

module.exports = router;
