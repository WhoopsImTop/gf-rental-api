const express = require("express");
const router = express.Router();
const {
  createCarAbo,
  findAllCarAbos,
  findAllCarAboAdmin,
  findAvailableCarAbos,
  findOneCarAbo,
  updateCarAbo,
  deleteCarAbo,
} = require("../controllers/carAboController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.post("/", authenticateToken, createCarAbo);
router.get("/", findAllCarAbos);
router.get("/admin", authenticateToken, findAllCarAboAdmin);
router.get("/available", findAvailableCarAbos);
router.get("/:id", findOneCarAbo);
router.patch("/:id", authenticateToken, updateCarAbo);
router.delete("/:id", authenticateToken, deleteCarAbo);

module.exports = router;
