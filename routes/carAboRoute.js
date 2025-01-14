const express = require("express");
const router = express.Router();
const { createCarAbo, findAllCarAbos, findOneCarAbo, updateCarAbo, deleteCarAbo } = require("../controllers/carAboController");

router.post("/", createCarAbo);
router.get("/", findAllCarAbos);
router.get("/:id", findOneCarAbo);
router.put("/:id", updateCarAbo);
router.delete("/:id", deleteCarAbo);

module.exports = router;

