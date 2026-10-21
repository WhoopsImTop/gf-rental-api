const express = require("express");
const router = express.Router();
const controller = require("../controllers/deliveryPlaceController");
const { requireStaff } = require("../middleware/requireStaff");

router.get("/", ...requireStaff, controller.getAllDeliveryPlaces);
router.post("/", ...requireStaff, controller.createDeliveryPlace);
router.patch("/:id", ...requireStaff, controller.updateDeliveryPlace);
router.delete("/:id", ...requireStaff, controller.deleteDeliveryPlace);

module.exports = router;
