// Dummy-Konfiguration, damit beim Laden der Module keine echte DB/Secrets genutzt werden.
process.env.JWT_SECRET = "test-jwt-secret";
process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.DBHOST = "127.0.0.1";
process.env.DBNAME = "test";
process.env.DBUSER = "test";
process.env.DBPASS = "test";
process.env.FOLLOWUP_ENABLED = "false";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Externe Seiteneffekte stubben, bevor der Controller sie per Destructuring bindet.
const followup = require("../../services/followup/followupService");
followup.scheduleForCart = async () => {};
followup.attachUserToCartJobs = async () => {};

const cantamen = require("../../services/auth/cantamen");
cantamen.authentificateWithCantamen = async () => ({ id: "cantamen-1" });
cantamen.collectUserDataFromCantamen = async () => ({
  userData: {
    emailAddress: "kunde@example.de",
    prename: "Kim",
    name: "Kunde",
    gender: "FEMALE",
    mobilePhoneNr: "0170000000",
    customerNumber: "C-1",
    address: {},
  },
  sepaMandate: false,
  sepaMandateReference: null,
  sepaAccount: null,
});

const db = require("../../models");
const { createToken } = require("../../services/auth/tokenService");
const { authenticateToken } = require("../../middleware/authMiddleware");
const authController = require("../../controllers/auth/AuthentificationController");

// Security-Audit schreibt nach ./logs – im Test in ein temporaeres Verzeichnis umleiten.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gf-sec-test-"));
fs.mkdirSync(path.join(tmpDir, "logs"));
process.chdir(tmpDir);

const VALID_CART_TOKEN = "a".repeat(64);

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value) {
      this.cookies.push({ name, value });
      return this;
    },
    clearCookie(name) {
      this.clearedCookies.push(name);
      return this;
    },
  };
}

function mockReq({ body = {}, headers = {} } = {}) {
  return {
    body,
    headers,
    method: "GET",
    baseUrl: "/api/test",
    path: "/",
    originalUrl: "/api/test",
    socket: { remoteAddress: "127.0.0.1" },
  };
}

// Stubs pro Test setzen und danach zuruecksetzen.
function stub(obj, key, value, t) {
  const original = obj[key];
  obj[key] = value;
  t.after(() => {
    obj[key] = original;
  });
}

// ─── authenticateToken ──────────────────────────────────────────

async function runAuth(t, role) {
  let sessionDestroyed = false;
  stub(db.Session, "findOne", async () => ({
    id: 1,
    expiresAt: new Date(Date.now() + 60_000),
    save: async () => {},
    destroy: async () => {
      sessionDestroyed = true;
    },
  }), t);
  stub(db.User, "findByPk", async () => ({ id: 7, firstName: "A", lastName: "B", role }), t);

  const token = createToken({ userId: 7, role });
  const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
  const res = mockRes();
  let nextCalled = false;
  await authenticateToken(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled, sessionDestroyed };
}

test("authenticateToken accepts ADMIN and SELLER sessions", async (t) => {
  for (const role of ["ADMIN", "SELLER"]) {
    const { nextCalled, req } = await runAuth(t, role);
    assert.equal(nextCalled, true, role);
    assert.equal(req.user.role, role);
  }
});

test("authenticateToken rejects and revokes CUSTOMER sessions", async (t) => {
  const { nextCalled, res, sessionDestroyed } = await runAuth(t, "CUSTOMER");
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(sessionDestroyed, true);
  assert.equal(res.clearedCookies.length, 1);
});

// ─── Login ──────────────────────────────────────────────────────

test("loginUser rejects CUSTOMER accounts like unknown users", async (t) => {
  stub(db.User, "scope", () => ({
    findOne: async () => ({ id: 9, role: "CUSTOMER", passwordHash: "x", mfaEnabled: false }),
  }), t);
  const res = mockRes();
  await authController.loginUser(
    mockReq({ body: { email: "kunde@example.de", password: "egal1234" } }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid email or password");
  assert.equal(res.cookies.length, 0);
});

test("requestPasswordReset sends no code to CUSTOMER accounts", async (t) => {
  let created = false;
  stub(db.User, "scope", () => ({ findOne: async () => ({ id: 9, role: "CUSTOMER" }) }), t);
  stub(db.PasswordResetCode, "create", async () => {
    created = true;
  }, t);
  const res = mockRes();
  await authController.requestPasswordReset(mockReq({ body: { email: "kunde@example.de" } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(created, false);
});

// ─── Checkout-Login ohne Session ────────────────────────────────

test("verifyOtp links the cart but issues no session, cookie or token", async (t) => {
  let sessionCreated = false;
  let cartUpdate;
  stub(db.VerificationCode, "findOne", async () => ({
    expiresAt: new Date(Date.now() + 60_000),
    destroy: async () => {},
  }), t);
  stub(db.Cart, "findOne", async () => ({ id: 3, completed: false }), t);
  stub(db.Cart, "update", async (values) => {
    cartUpdate = values;
  }, t);
  stub(db.User, "scope", () => ({ findOne: async () => ({ id: 11, role: "CUSTOMER", email: "kunde@example.de" }) }), t);
  stub(db.Session, "create", async () => {
    sessionCreated = true;
  }, t);

  const res = mockRes();
  await authController.verifyOtp(
    mockReq({ body: { email: "kunde@example.de", code: "123456", accessToken: VALID_CART_TOKEN } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, 11);
  assert.equal("token" in res.body, false);
  assert.equal(res.cookies.length, 0);
  assert.equal(sessionCreated, false);
  assert.deepEqual(cartUpdate, { userId: 11 });
});

test("verifyOtp does not burn the code when the cart is invalid", async (t) => {
  let codeDestroyed = false;
  stub(db.VerificationCode, "findOne", async () => ({
    expiresAt: new Date(Date.now() + 60_000),
    destroy: async () => {
      codeDestroyed = true;
    },
  }), t);
  stub(db.Cart, "findOne", async () => null, t);

  const res = mockRes();
  await authController.verifyOtp(
    mockReq({ body: { email: "kunde@example.de", code: "123456", accessToken: VALID_CART_TOKEN } }),
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(codeDestroyed, false);
});

test("cantamenAuth returns prefill data but no session, cookie or token", async (t) => {
  let sessionCreated = false;
  stub(db.Cart, "findOne", async () => ({ id: 3, completed: false }), t);
  stub(db.Cart, "update", async () => {}, t);
  stub(db.User, "scope", () => ({
    findOne: async () => ({ id: 12, role: "CUSTOMER", phone: "0170000000", cantamenCustomerId: "C-1", update: async () => {} }),
  }), t);
  stub(db.Session, "create", async () => {
    sessionCreated = true;
  }, t);

  const res = mockRes();
  await authController.cantamenAuth(
    mockReq({ body: { email: "kunde@example.de", password: "cantamen-pw", accessToken: VALID_CART_TOKEN } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.id, 12);
  assert.equal(res.body.user.customerType, "private");
  assert.equal("token" in res.body, false);
  assert.equal(res.cookies.length, 0);
  assert.equal(sessionCreated, false);
});

// ─── Benutzer anlegen (nur Admin im CRM) ────────────────────────

test("registerUser only accepts known roles", async () => {
  const res = mockRes();
  await authController.registerUser(
    mockReq({ body: { email: "neu@example.de", password: "Passwort1", role: "SUPERADMIN" } }),
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("registerUser stores the role chosen in the CRM", async (t) => {
  let createdRole;
  stub(db.User, "scope", () => ({ findOne: async () => null }), t);
  stub(db.User, "create", async (values) => {
    createdRole = values.role;
    return { id: 20 };
  }, t);
  const res = mockRes();
  await authController.registerUser(
    mockReq({ body: { firstName: "S", lastName: "E", email: "seller@example.de", phone: "1", password: "Passwort1", role: "SELLER" } }),
    res,
  );
  assert.equal(res.statusCode, 201);
  assert.equal(createdRole, "SELLER");
});

// ─── Fehlversuche bei OTP- und Reset-Codes ──────────────────────

test("verifyOtp only accepts unexpired codes with attempts left", async (t) => {
  let usedWhere;
  stub(db.VerificationCode, "findOne", async ({ where }) => {
    usedWhere = where;
    return null;
  }, t);
  stub(db.VerificationCode, "increment", async () => {}, t);

  await authController.verifyOtp(
    mockReq({ body: { email: "kunde@example.de", code: "123456", accessToken: VALID_CART_TOKEN } }),
    mockRes(),
  );

  const { Op } = require("sequelize");
  assert.equal(usedWhere.code, "123456");
  assert.equal(usedWhere.attempts[Op.lt], 5);
  assert.ok(usedWhere.expiresAt[Op.gt] instanceof Date);
});

test("a wrong OTP counts as failed attempt for all open codes of that email", async (t) => {
  let incremented;
  stub(db.VerificationCode, "findOne", async () => null, t);
  stub(db.VerificationCode, "increment", async (field, options) => {
    incremented = { field, where: options.where };
  }, t);

  const res = mockRes();
  await authController.verifyOtp(
    mockReq({ body: { email: "kunde@example.de", code: "000000", accessToken: VALID_CART_TOKEN } }),
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.equal(incremented.field, "attempts");
  assert.ok(incremented.where.emailHash);
});

test("a wrong reset code counts as failed attempt", async (t) => {
  let incremented = false;
  stub(db.PasswordResetCode, "findOne", async () => null, t);
  stub(db.PasswordResetCode, "increment", async () => {
    incremented = true;
  }, t);

  const res = mockRes();
  await authController.resetPassword(
    mockReq({ body: { email: "admin@example.de", code: "000000", newPassword: "NeuesPasswort1" } }),
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.equal(incremented, true);
});

// ─── Cantamen-Import speichert kein Passwort ────────────────────

test("cantamenAuth creates new customers without a password hash", async (t) => {
  let createdValues;
  stub(db.Cart, "findOne", async () => ({ id: 3, completed: false }), t);
  stub(db.Cart, "update", async () => {}, t);
  stub(db.User, "scope", () => ({ findOne: async () => null }), t);
  stub(db.User, "create", async (values) => {
    createdValues = values;
    return { id: 30, ...values };
  }, t);

  const res = mockRes();
  await authController.cantamenAuth(
    mockReq({ body: { email: "kunde@example.de", password: "cantamen-pw", accessToken: VALID_CART_TOKEN } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(createdValues.role, "CUSTOMER");
  assert.equal("passwordHash" in createdValues, false);
});

// ─── Vertraege werden nur weich geloescht ───────────────────────

test("Contract model uses soft delete (paranoid)", () => {
  assert.equal(db.Contract.options.paranoid, true);
  assert.ok(db.Contract.rawAttributes.deletedAt, "deletedAt attribute expected");
});

// ─── Benutzerverwaltung im CRM ──────────────────────────────────

const usersController = require("../../controllers/general/usersController");

test("getCrmUsers returns the role but never secrets or hashes", async (t) => {
  let options;
  stub(db.User, "findAll", async (opts) => {
    options = opts;
    return [];
  }, t);
  const res = mockRes();
  await usersController.getCrmUsers(mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.ok(options.attributes.includes("role"));
  for (const secret of ["passwordHash", "mfaSecret", "emailHash"]) {
    assert.equal(options.attributes.includes(secret), false, secret);
  }
});

function stubEditableUser(t, role) {
  const state = { updated: null, sessionsDestroyed: false };
  stub(db.User, "scope", () => ({
    findByPk: async () => ({
      id: 40,
      role,
      update: async (values) => {
        state.updated = values;
      },
    }),
  }), t);
  stub(db.Session, "destroy", async () => {
    state.sessionsDestroyed = true;
  }, t);
  return state;
}

test("updateCrmUser: unchanged role in the form is not a role change (SELLER edits customer)", async (t) => {
  const state = stubEditableUser(t, "CUSTOMER");
  const req = mockReq({ body: { firstName: "Neu", role: "CUSTOMER" } });
  req.params = { id: "40" };
  req.user = { id: 1, role: "SELLER" };
  const res = mockRes();
  await usersController.updateCrmUser(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(state.updated, { firstName: "Neu" });
  assert.equal(state.sessionsDestroyed, false);
});

test("updateCrmUser: editing an admin without role keeps the admin role", async (t) => {
  const state = stubEditableUser(t, "ADMIN");
  const req = mockReq({ body: { phone: "0123" } });
  req.params = { id: "40" };
  req.user = { id: 1, role: "ADMIN" };
  const res = mockRes();
  await usersController.updateCrmUser(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal("role" in state.updated, false);
});

test("updateCrmUser: SELLER cannot change roles", async (t) => {
  stubEditableUser(t, "CUSTOMER");
  const req = mockReq({ body: { role: "ADMIN" } });
  req.params = { id: "40" };
  req.user = { id: 1, role: "SELLER" };
  const res = mockRes();
  await usersController.updateCrmUser(req, res);
  assert.equal(res.statusCode, 403);
});

test("registerUser creates customers without password", async (t) => {
  let created;
  stub(db.User, "scope", () => ({ findOne: async () => null }), t);
  stub(db.User, "create", async (values) => {
    created = values;
    return { id: 41 };
  }, t);
  const res = mockRes();
  await authController.registerUser(
    mockReq({ body: { firstName: "K", lastName: "D", email: "k@example.de", phone: "1", role: "CUSTOMER" } }),
    res,
  );
  assert.equal(res.statusCode, 201);
  assert.equal(created.passwordHash, null);
});

test("registerUser requires at least 8 characters for staff passwords", async () => {
  const res = mockRes();
  await authController.registerUser(
    mockReq({ body: { email: "s@example.de", password: "kurz", role: "SELLER" } }),
    res,
  );
  assert.equal(res.statusCode, 400);
});
