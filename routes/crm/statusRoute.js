const express = require("express");
const router = express.Router();
const { uploadFile } = require("../../services/upload");
const {
  createStatus,
  findAllStatuses,
  findOneStatus,
  updateStatus,
  deleteStatus,
} = require("../../controllers/crm/statusController");

router.post("/", uploadFile("media"), createStatus);
router.get("/", findAllStatuses);
router.get("/:id", findOneStatus);
router.patch("/:id", updateStatus);
router.delete("/:id", deleteStatus);

module.exports = router;
