const express = require("express");
const router = express.Router();
const { uploadFile } = require("../../services/upload");
const { authorizeRoles } = require("../../middleware/authorizationMiddleware");
const {
  createStatus,
  findAllStatuses,
  findOneStatus,
  updateStatus,
  deleteStatus,
} = require("../../controllers/crm/statusController");

router.post("/", authorizeRoles("ADMIN", "SELLER"), uploadFile("media"), createStatus);
router.get("/", authorizeRoles("ADMIN", "SELLER"), findAllStatuses);
router.get("/:id", authorizeRoles("ADMIN", "SELLER"), findOneStatus);
router.patch("/:id", authorizeRoles("ADMIN", "SELLER"), updateStatus);
router.delete("/:id", authorizeRoles("ADMIN", "SELLER"), deleteStatus);

module.exports = router;
