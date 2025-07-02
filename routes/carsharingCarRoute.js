const express = require("express");
const router = express.Router();
const { 
  createCarsharingCar, 
  findAllCarsharingCars, 
  findOneCarsharingCar, 
  updateCarsharingCar, 
  deleteCarsharingCar,
  addImageToCarsharingCar,
  removeImageFromCarsharingCar
} = require("../controllers/carsharingCarController");

// Basic CRUD routes
router.post("/", createCarsharingCar);
router.get("/", findAllCarsharingCars);
router.get("/:id", findOneCarsharingCar);
router.put("/:id", updateCarsharingCar);
router.delete("/:id", deleteCarsharingCar);

// Image linking routes (link existing media to car)
router.post("/images", addImageToCarsharingCar); // Link existing media to car
router.delete("/:carId/images/:mediaId", removeImageFromCarsharingCar); // Remove image link

module.exports = router;
