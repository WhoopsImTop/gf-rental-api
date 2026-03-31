const express = require("express");
const router = express.Router();
const controller = require("../controllers/deliveryPlaceController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/", authenticateToken, controller.getAllDeliveryPlaces);
router.post("/", authenticateToken, controller.createDeliveryPlace);
router.patch("/:id", authenticateToken, controller.updateDeliveryPlace);
router.delete("/:id", authenticateToken, controller.deleteDeliveryPlace);

module.exports = router;
