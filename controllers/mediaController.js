const db = require("../models");

exports.uploadMedia = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a file!" });
    }
    
    // Create Media Object in DB
    const media = await db.Media.create({
      name: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      url: process.env.APPURL + "/public/uploads/" + req.file.filename,
    });
    
    return res.status(201).json({
      message: "File uploaded successfully",
      media: media,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.uploadMultipleMedia = async (req, res) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Please upload at least one file!" });
    }
    
    const uploadedMedia = [];
    
    // Process each uploaded file
    for (const file of req.files) {
      // Create Media Object in DB
      const media = await db.Media.create({
        name: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        url: process.env.APPURL + "/public/uploads/" + file.filename,
      });
      
      uploadedMedia.push(media);
    }
    
    return res.status(201).json({
      message: `${uploadedMedia.length} files uploaded successfully`,
      media: uploadedMedia,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllMedia = async (req, res) => {
  try {
    const media = await db.Media.findAll({
      attributes: ["id", "name", "fileSize", "fileType", "url", "createdAt"],
      order: [["createdAt", "DESC"]],
    });
    return res.status(200).json(media);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getMediaById = async (req, res) => {
  try {
    const { id } = req.params;
    const media = await db.Media.findByPk(id, {
      attributes: ["id", "name", "fileSize", "fileType", "url", "createdAt"],
    });
    
    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }
    
    return res.status(200).json(media);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.Media.destroy({
      where: { id: id },
    });
    
    if (deleted) {
      return res.status(204).json({ message: "Media deleted successfully" });
    } else {
      return res.status(404).json({ error: "Media not found" });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
