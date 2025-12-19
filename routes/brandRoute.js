const express = require("express");
const router = express.Router();
const { findAllBrands, createBrand } = require("../controllers/brandController");

router.get("/", findAllBrands);
router.post("/", createBrand);

module.exports = router;
