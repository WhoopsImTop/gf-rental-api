const express = require("express");
const router = express.Router();
const { findAllSellers, createSeller } = require("../controllers/sellerController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/authorizationMiddleware");

router.get("/", findAllSellers);
router.post("/", authenticateToken, authorizeRoles("ADMIN"), createSeller);

module.exports = router;
