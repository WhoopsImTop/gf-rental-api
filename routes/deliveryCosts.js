const express = require("express");
const router = express.Router();
const controller = require("../controllers/deliveryCostController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/", authenticateToken, controller.getAllPlz);
router.get("/:plz", controller.getDeliveryCostByPlz);
router.patch("/recalculate", controller.recalculateDeliveryCosts);

module.exports = router;
