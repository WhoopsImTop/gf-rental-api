const express = require("express");
const router = express.Router();
const { createCustomer, findAllCustomers, findOneCustomer, updateCustomer, setCustomerAction, deleteCustomer, assignUserToCustomer } = require("../../controllers/crm/customerController");

router.post("/", createCustomer);
router.get("/", findAllCustomers);
router.get("/:id", findOneCustomer);
router.patch("/:id", updateCustomer);
router.patch("/:id/assign", assignUserToCustomer);
router.patch("/:id/unassign", removeUserFromCustomer);
router.patch("/:id/action", setCustomerAction);
router.delete("/:id", deleteCustomer);

module.exports = router;