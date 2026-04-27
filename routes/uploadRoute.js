const express = require("express");
const router = express.Router();
const { uploadFile, uploadFiles } = require("../services/upload");
const { authenticateToken } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/authorizationMiddleware");
const { 
  uploadMedia,
  uploadMultipleMedia,
  getAllMedia,
  getMediaById,
  deleteMedia
} = require("../controllers/mediaController");

const canManageMedia = [authenticateToken, authorizeRoles("ADMIN", "SELLER")];

// Upload routes
router.post("/single", canManageMedia, uploadFile("file"), uploadMedia); // Single file upload
router.post("/multiple", canManageMedia, uploadFiles("files", 10), uploadMultipleMedia); // Multiple files upload (max 10)

// Media management routes
router.get("/", canManageMedia, getAllMedia); // Get all media
router.get("/:id", canManageMedia, getMediaById); // Get specific media
router.delete("/:id", canManageMedia, deleteMedia); // Delete media

module.exports = router;
