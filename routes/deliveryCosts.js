const express = require("express");
const router = express.Router();
const controller = require("../controllers/deliveryCostController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

router.get("/", authenticateToken, controller.getAllPlz);
router.get("/:plz", controller.getDeliveryCostByPlz);
router.patch(
  "/recalculate",
  authenticateToken,
  requireRole("ADMIN", "SELLER"),
  controller.recalculateDeliveryCosts,
);

module.exports = router;
