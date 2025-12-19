const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");

router.post("/sync", cartController.syncCart);
router.get("/:id", cartController.getCart);

module.exports = router;
