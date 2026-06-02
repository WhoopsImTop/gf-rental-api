const express = require("express");
const router = express.Router();
const { createCustomer, findAllCustomers, findOneCustomer, updateCustomer, setCustomerAction, deleteCustomer, assignUserToCustomer, removeUserFromCustomer } = require("../../controllers/crm/customerController");
const { requireRole } = require("../../middleware/requireRole");

router.post("/", requireRole("ADMIN", "SELLER"), createCustomer);
router.get("/", requireRole("ADMIN", "SELLER"), findAllCustomers);
router.get("/:id", requireRole("ADMIN", "SELLER"), findOneCustomer);
router.patch("/:id", requireRole("ADMIN", "SELLER"), updateCustomer);
router.patch("/:id/assign", requireRole("ADMIN", "SELLER"), assignUserToCustomer);
router.patch("/:id/unassign", requireRole("ADMIN", "SELLER"), removeUserFromCustomer);
router.patch("/:id/action", requireRole("ADMIN", "SELLER"), setCustomerAction);
router.delete("/:id", requireRole("ADMIN", "SELLER"), deleteCustomer);

module.exports = router;