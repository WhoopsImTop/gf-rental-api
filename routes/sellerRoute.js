const express = require("express");
const router = express.Router();
const { findAllSellers, createSeller } = require("../controllers/sellerController");

router.get("/", findAllSellers);
router.post("/", createSeller);

module.exports = router;
