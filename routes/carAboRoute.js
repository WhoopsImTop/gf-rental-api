const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  createCarAbo,
  findAllCarAbos,
  findAllCarAboAdmin,
  findAvailableCarAbos,
  findOneCarAbo,
  updateCarAbo,
  deleteCarAbo,
  calculatePrice,
} = require("../controllers/carAboController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

const calculatePriceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many price calculation requests from this IP, please try again later",
});

router.post("/", authenticateToken, requireRole("ADMIN", "SELLER"), createCarAbo);
router.post("/:id/calculate-price", calculatePriceLimiter, calculatePrice);
router.get("/", findAllCarAbos);
router.get("/admin", authenticateToken, findAllCarAboAdmin);
router.get("/available", findAvailableCarAbos);
router.get("/:id", findOneCarAbo);
router.patch("/:id", authenticateToken, updateCarAbo);
router.delete("/:id", authenticateToken, deleteCarAbo);

module.exports = router;
