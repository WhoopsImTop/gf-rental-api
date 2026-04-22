const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const contractController = require("../controllers/contractController");
const { authenticateToken } = require("../middleware/authMiddleware");

const publicSignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many requests from this IP, please try again later",
});

const contractUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../internal-files/contracts"));
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || ".pdf");
    const contractId = req.params.id || "contract";
    cb(null, `vertrag_upload_${contractId}_${Date.now()}${extension}`);
  },
});

const contractUpload = multer({
  storage: contractUploadStorage,
  limits: { fileSize: 1024 * 1024 * 10 },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfName = /\.pdf$/i.test(file.originalname || "");
    if (isPdfMime || isPdfName) {
      return cb(null, true);
    }
    return cb(new Error("Only PDF files are allowed"));
  },
});

router.get(
  "/view/:filename",
  authenticateToken,
  contractController.viewContractFile
);
router.get(
  "/signature/:filename",
  authenticateToken,
  contractController.viewSignatureFile
);
router.get(
  "/share/:accessKey",
  contractController.shareContractFile
);
router.post(
  "/:id/sign-link",
  authenticateToken,
  contractController.issueContractSignLink
);
router.post(
  "/:id/share-link",
  authenticateToken,
  contractController.issueContractShareLink
);
router.get(
  "/sign/public/:token",
  publicSignLimiter,
  contractController.getSignContractByToken
);
router.get(
  "/sign/public/:token/preview",
  publicSignLimiter,
  contractController.getSignContractPreviewByToken
);
router.post(
  "/sign/public/:token",
  publicSignLimiter,
  contractController.submitContractSignature
);
router.get("/", authenticateToken, contractController.getAllContracts);
router.post("/", contractController.createContract);
router.post("/generate-pdf/:id", contractController.generateContract);
router.post(
  "/:id/upload-contract",
  authenticateToken,
  contractUpload.single("contractFile"),
  contractController.uploadContractFile
);
router.patch(
  "/archive/:id",
  authenticateToken,
  contractController.archiveContract
);
router.delete("/:id", authenticateToken, contractController.deleteContract);

module.exports = router;
