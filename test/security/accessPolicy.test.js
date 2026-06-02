const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isPrivilegedRole,
  buildContractListWhere,
  createGenericServerErrorResponse,
} = require("../../services/security/accessPolicy");

test("isPrivilegedRole only allows ADMIN and SELLER", () => {
  assert.equal(isPrivilegedRole("ADMIN"), true);
  assert.equal(isPrivilegedRole("SELLER"), true);
  assert.equal(isPrivilegedRole("CUSTOMER"), false);
  assert.equal(isPrivilegedRole(undefined), false);
});

test("buildContractListWhere scopes non privileged users to own contracts", () => {
  assert.deepEqual(buildContractListWhere({ id: 123, role: "CUSTOMER" }), {
    userId: 123,
  });
  assert.deepEqual(buildContractListWhere({ id: 5, role: "ADMIN" }), {});
  assert.deepEqual(buildContractListWhere({ id: 6, role: "SELLER" }), {});
});

test("buildContractListWhere rejects missing auth user", () => {
  assert.throws(() => buildContractListWhere(null), /AUTH_USER_REQUIRED/);
});

test("createGenericServerErrorResponse never exposes internals", () => {
  assert.deepEqual(createGenericServerErrorResponse(), {
    message: "Internal server error",
  });
  assert.deepEqual(createGenericServerErrorResponse("Interner Serverfehler"), {
    message: "Interner Serverfehler",
  });
});
