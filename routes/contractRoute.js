const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contractController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/", authenticateToken, contractController.getAllContracts);
router.post("/", contractController.createContract);
router.delete("/:id", authenticateToken, contractController.deleteContract);

module.exports = router;
