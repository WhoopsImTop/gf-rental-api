const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/authorizationMiddleware");
const { 
  createCarsharingCar, 
  findAllCarsharingCars, 
  findOneCarsharingCar, 
  updateCarsharingCar, 
  deleteCarsharingCar,
  addImageToCarsharingCar,
  removeImageFromCarsharingCar
} = require("../controllers/carsharingCarController");

const canManageCarsharingCars = [
  authenticateToken,
  authorizeRoles("ADMIN", "SELLER"),
];

// Basic CRUD routes
router.post("/", canManageCarsharingCars, createCarsharingCar);
router.get("/", findAllCarsharingCars);
router.get("/:id", findOneCarsharingCar);
router.patch("/:id", canManageCarsharingCars, updateCarsharingCar);
router.delete("/:id", canManageCarsharingCars, deleteCarsharingCar);

// Image linking routes (link existing media to car)
router.post("/images", canManageCarsharingCars, addImageToCarsharingCar); // Link existing media to car
router.delete("/:carId/images/:mediaId", canManageCarsharingCars, removeImageFromCarsharingCar); // Remove image link

module.exports = router;
