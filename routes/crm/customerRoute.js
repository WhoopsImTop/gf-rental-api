const express = require("express");
const router = express.Router();
const { createCustomer, findAllCustomers, findOneCustomer, updateCustomer, deleteCustomer } = require("../../controllers/crm/customerController");

router.post("/", createCustomer);
router.get("/", findAllCustomers);
router.get("/:id", findOneCustomer);
router.put("/:id", updateCustomer);
router.delete("/:id", deleteCustomer);

module.exports = router;