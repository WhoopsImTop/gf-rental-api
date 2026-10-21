"use strict";

const { authenticateToken } = require("./authMiddleware");
const { requireRole } = require("./requireRole");

/**
 * Nur angemeldete CRM-Mitarbeiter (ADMIN/SELLER).
 * Verwendung: router.get("/", ...requireStaff, handler)
 */
const requireStaff = [authenticateToken, requireRole("ADMIN", "SELLER")];

module.exports = { requireStaff };
