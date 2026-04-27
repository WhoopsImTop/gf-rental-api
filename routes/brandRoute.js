const express = require("express");
const router = express.Router();
const { findAllBrands, createBrand } = require("../controllers/brandController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/authorizationMiddleware");

router.get("/", findAllBrands);
router.post("/", authenticateToken, authorizeRoles("ADMIN", "SELLER"), createBrand);

module.exports = router;
