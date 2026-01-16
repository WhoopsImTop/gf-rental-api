const express = require("express");
const router = express.Router();
const contractController = require("../controllers/contractController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get(
  "/view/:filename",
  authenticateToken,
  contractController.viewContractFile
);
router.get(
  "/share/:accessKey",
  authenticateToken,
  contractController.shareContractFile
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
