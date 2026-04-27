const multer = require("multer");
const path = require("path");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const isAllowedMime = ALLOWED_MIME_TYPES.has(file.mimetype);
    const isAllowedExtension = ALLOWED_EXTENSIONS.has(extension);

    if (!isAllowedMime || !isAllowedExtension) {
      return cb(new Error("Invalid file type"));
    }

    return cb(null, true);
  },
});

exports.uploadFile = (key) => upload.single(key);
exports.uploadFiles = (key, maxCount) => upload.array(key, maxCount);
exports.uploadFields = (fields) => upload.fields(fields);
