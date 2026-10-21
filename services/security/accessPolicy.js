function isPrivilegedRole(role) {
  return role === "ADMIN" || role === "SELLER";
}

// Vertraege sehen nur CRM-Mitarbeiter (Kunden haben keinen Login).
function buildContractListWhere(user) {
  if (!user || typeof user.id === "undefined") {
    throw new Error("AUTH_USER_REQUIRED");
  }
  if (!isPrivilegedRole(user.role)) {
    throw new Error("STAFF_ROLE_REQUIRED");
  }
  return {};
}

// Verwaltung eines Vertrags (Ansehen, Upload, Signatur-/Freigabe-Link, Archiv, Loeschen)
// ist ausschliesslich CRM-Mitarbeitern vorbehalten.
function canManageContract(user) {
  return Boolean(user) && isPrivilegedRole(user.role);
}

function createGenericServerErrorResponse(message = "Internal server error") {
  return { message };
}

module.exports = {
  isPrivilegedRole,
  buildContractListWhere,
  canManageContract,
  createGenericServerErrorResponse,
};
