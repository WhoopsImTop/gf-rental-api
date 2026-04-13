const express = require("express");
const router = express.Router();
const { getVehicleSitemap } = require("../../controllers/website/sitemapController");

router.get("/", getVehicleSitemap);

module.exports = router;
