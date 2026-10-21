const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const contractController = require("../controllers/contractController");
// Alle angemeldeten Vertragsrouten sind nur fuer CRM-Mitarbeiter (ADMIN/SELLER).
// Oeffentlich bleiben: Vertragsabschluss (POST /), Signatur- und Freigabe-Links per Token.
const { requireStaff } = require("../middleware/requireStaff");

const publicSignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many requests from this IP, please try again later",
});

const publicCreateContractLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many contract requests from this IP, please try again later",
});

const publicCreateContractSlowDown = slowDown({
  windowMs: 60 * 1000,
  delayAfter: 8,
  delayMs: () => 250,
  maxDelayMs: 8000,
  skipSuccessfulRequests: true,
});

const contractUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../internal-files/contracts"));
  },
  filename: (req, file, cb) => {
    // Keine Nutzereingaben ungeprueft in den Pfad: id nur als Ziffernfolge,
    // Endung fest ".pdf" (fileFilter laesst ohnehin nur PDFs zu).
    const rawId = String(req.params.id || "");
    const contractId = /^\d+$/.test(rawId) ? rawId : "contract";
    cb(null, `vertrag_upload_${contractId}_${crypto.randomUUID()}.pdf`);
  },
});

const contractUpload = multer({
  storage: contractUploadStorage,
  limits: { fileSize: 1024 * 1024 * 10 },
  fileFilter: (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfName = /\.pdf$/i.test(file.originalname || "");
    if (isPdfMime && isPdfName) {
      return cb(null, true);
    }
    return cb(new Error("Only PDF files are allowed"));
  },
});

// Vertrags-IDs sind Ganzzahlen. Wird vor allen Handlern (auch multer) ausgefuehrt.
router.param("id", (req, res, next, id) => {
  if (!/^\d+$/.test(String(id))) {
    return res.status(400).json({ success: false, message: "Ungueltige Vertrags-ID" });
  }
  return next();
});

router.get(
  "/view/:filename",
  ...requireStaff,
  contractController.viewContractFile
);
router.get(
  "/signature/:filename",
  ...requireStaff,
  contractController.viewSignatureFile
);
router.get(
  "/share/:accessKey",
  contractController.shareContractFile
);
router.post(
  "/:id/sign-link",
  ...requireStaff,
  contractController.issueContractSignLink
);
router.post(
  "/:id/share-link",
  ...requireStaff,
  contractController.issueContractShareLink
);
router.post(
  "/:id/share-link/revoke",
  ...requireStaff,
  contractController.revokeContractShareLink
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
router.get("/", ...requireStaff, contractController.getAllContracts);
router.post(
  "/",
  publicCreateContractLimiter,
  publicCreateContractSlowDown,
  contractController.createContract,
);
router.post("/generate-pdf/:id", ...requireStaff, contractController.generateContract);
router.post(
  "/:id/upload-contract",
  ...requireStaff,
  contractUpload.single("contractFile"),
  contractController.uploadContractFile
);
router.patch(
  "/:id/party-data",
  ...requireStaff,
  contractController.updateContractPartyData,
);
router.patch(
  "/archive/:id",
  ...requireStaff,
  contractController.archiveContract
);
router.delete("/:id", ...requireStaff, contractController.deleteContract);

module.exports = router;
