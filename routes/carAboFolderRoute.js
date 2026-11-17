const express = require("express");
const router = express.Router();
const {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveCarAbos,
} = require("../controllers/carAboFolderController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

// Ordner sind reine CRM-Organisation: alle Routen nur für Mitarbeitende.
const staff = [authenticateToken, requireRole("ADMIN", "SELLER")];

router.get("/", ...staff, getFolders);
router.post("/", ...staff, createFolder);
router.put("/assignments", ...staff, moveCarAbos);
router.patch("/:id(\\d+)", ...staff, updateFolder);
router.delete("/:id(\\d+)", ...staff, deleteFolder);

module.exports = router;
