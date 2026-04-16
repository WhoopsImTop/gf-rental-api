const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const contractController = require("../controllers/contractController");
const { authenticateToken } = require("../middleware/authMiddleware");

const publicSignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many requests from this IP, please try again later",
});

router.get(
  "/view/:filename",
  authenticateToken,
  contractController.viewContractFile
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
router.patch(
  "/archive/:id",
  authenticateToken,
  contractController.archiveContract
);
router.delete("/:id", authenticateToken, contractController.deleteContract);

module.exports = router;
