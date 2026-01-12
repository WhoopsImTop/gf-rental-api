const express = require("express");
const router = express.Router();
const controller = require("../controllers/deliveryCostController");

router.get("/:plz", controller.getDeliveryCostByPlz);
router.patch("/recalculate", controller.recalculateDeliveryCosts);

module.exports = router;
