"use strict";

const { authorizeRoles } = require("./authorizationMiddleware");

/**
 * Alias fuer authorizeRoles (Rollenpruefung nach authenticateToken).
 * @param {...string} roles z.B. "ADMIN", "SELLER"
 */
function requireRole(...roles) {
  return authorizeRoles(...roles);
}

module.exports = { requireRole };
