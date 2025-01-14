const multer = require("multer");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5 MB
});

exports.uploadFile = (key) => upload.single(key);
exports.uploadFiles = (key, maxCount) => upload.array(key, maxCount);
exports.uploadFields = (fields) => upload.fields(fields);
