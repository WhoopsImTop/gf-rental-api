const express = require("express");
const router = express.Router();
const { uploadFile, uploadFiles } = require("../services/upload");
const { 
  uploadMedia,
  uploadMultipleMedia,
  getAllMedia,
  getMediaById,
  deleteMedia
} = require("../controllers/mediaController");

// Upload routes
router.post("/single", uploadFile("file"), uploadMedia); // Single file upload
router.post("/multiple", uploadFiles("files", 10), uploadMultipleMedia); // Multiple files upload (max 10)

// Media management routes
router.get("/", getAllMedia); // Get all media
router.get("/:id", getMediaById); // Get specific media
router.delete("/:id", deleteMedia); // Delete media

module.exports = router;
