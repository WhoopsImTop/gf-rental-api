const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const {
  getChargingStations,
  getChargingStation,
  getFreiburgArea,
} = require("../../controllers/charging-stations/chargingStationController");

// Öffentlich für die Kundenkarte; jedes Verschieben der Karte lädt den Ausschnitt neu.
const chargingStationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: "Too many requests from this IP, please try again later",
});

router.get("/", chargingStationsLimiter, getChargingStations);
router.get("/freiburg-area", chargingStationsLimiter, getFreiburgArea);
router.get("/:id(\\d+)", chargingStationsLimiter, getChargingStation);

module.exports = router;
