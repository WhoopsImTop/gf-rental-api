function isPrivilegedRole(role) {
  return role === "ADMIN" || role === "SELLER";
}

function buildContractListWhere(user) {
  if (!user || typeof user.id === "undefined") {
    throw new Error("AUTH_USER_REQUIRED");
  }
  return isPrivilegedRole(user.role) ? {} : { userId: user.id };
}

function createGenericServerErrorResponse(message = "Internal server error") {
  return { message };
}

module.exports = {
  isPrivilegedRole,
  buildContractListWhere,
  createGenericServerErrorResponse,
};
