const express = require("express");
const router = express.Router();
const {
  createCarAbo,
  findAllCarAbos,
  findAvailableCarAbos,
  findOneCarAbo,
  updateCarAbo,
  deleteCarAbo,
} = require("../controllers/carAboController");

router.post("/", createCarAbo);
router.get("/", findAllCarAbos);
router.get("/available", findAvailableCarAbos);
router.get("/:id", findOneCarAbo);
router.patch("/:id", updateCarAbo);
router.delete("/:id", deleteCarAbo);

module.exports = router;
