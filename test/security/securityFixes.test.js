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
const path = require("path");
const express = require("express");

// authenticateToken durch einen Stub ersetzen (Rolle per Header), bevor Routen geladen werden.
const authMiddlewarePath = require.resolve("../../middleware/authMiddleware");
require.cache[authMiddlewarePath] = {
  id: authMiddlewarePath,
  filename: authMiddlewarePath,
  loaded: true,
  exports: {
    authenticateToken: (req, res, next) => {
      const role = req.headers["x-test-role"];
      if (!role) return res.status(401).json({ message: "Unauthorized" });
      req.user = { id: 1, role };
      return next();
    },
  },
};

const {
  isSixDigitCode,
  isNonEmptyString,
  isValidNewPassword,
} = require("../../utils/authInput");
const authController = require("../../controllers/auth/AuthentificationController");
const { requireStaff } = require("../../middleware/requireStaff");
const db = require("../../models");

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildApp() {
  const { authenticateToken } = require("../../middleware/authMiddleware");
  const app = express();
  app.use(express.json());
  app.use("/api/analytics", require("../../routes/analyticsRoute"));
  app.use("/api/delivery-places", require("../../routes/deliveryPlaces"));
  app.use("/api/delivery-costs", require("../../routes/deliveryCosts"));
  app.use("/api/settings", require("../../routes/settingRoute"));
  app.use("/api/crm/status", authenticateToken, require("../../routes/crm/statusRoute"));
  app.use("/api/contracts", require("../../routes/contractRoute"));
  app.use("/api/mail", require("../../routes/emailRoute"));
  app.use("/api/auth", require("../../routes/auth/AuthentificationRoute"));
  return app;
}

async function withServer(fn) {
  const server = buildApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ─── Eingabepruefung OTP / Reset-Codes ──────────────────────────

test("isSixDigitCode only accepts six-digit strings", () => {
  assert.equal(isSixDigitCode("123456"), true);
  assert.equal(isSixDigitCode("12345"), false);
  assert.equal(isSixDigitCode("1234567"), false);
  assert.equal(isSixDigitCode("12a456"), false);
  assert.equal(isSixDigitCode(123456), false);
  assert.equal(isSixDigitCode(["123456", "654321"]), false);
  assert.equal(isSixDigitCode({ $gt: "0" }), false);
  assert.equal(isSixDigitCode(undefined), false);
});

test("isNonEmptyString / isValidNewPassword reject non-strings", () => {
  assert.equal(isNonEmptyString("a@b.de"), true);
  assert.equal(isNonEmptyString(" "), false);
  assert.equal(isNonEmptyString(["a@b.de"]), false);
  assert.equal(isValidNewPassword("12345678"), true);
  assert.equal(isValidNewPassword("1234567"), false);
  assert.equal(isValidNewPassword(["12345678"]), false);
});

test("verifyOtp rejects an array code before any DB lookup", async () => {
  const res = mockRes();
  await authController.verifyOtp(
    { body: { email: "a@b.de", code: ["100000", "100001"], accessToken: "x" } },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("verifyOtp rejects a non-string email", async () => {
  const res = mockRes();
  await authController.verifyOtp({ body: { email: ["a@b.de"], code: "123456" } }, res);
  assert.equal(res.statusCode, 400);
});

test("resetPassword rejects an array code before any DB lookup", async () => {
  const res = mockRes();
  await authController.resetPassword(
    { body: { email: "a@b.de", code: [100000, 100001], newPassword: "Passwort123" } },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Invalid or expired reset code");
});

test("resetPassword rejects too short or non-string passwords", async () => {
  const res = mockRes();
  await authController.resetPassword(
    { body: { email: "a@b.de", code: "123456", newPassword: "kurz" } },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("requestPasswordReset answers generically for a non-string email", async () => {
  const res = mockRes();
  await authController.requestPasswordReset({ body: { email: ["a@b.de"] } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "If the email exists, a reset code has been sent");
});

// ─── MFA-Secret nicht in Standardantworten ──────────────────────

test("User defaultScope never selects mfaSecret, withPassword scope still does", () => {
  assert.ok(db.User.options.defaultScope.attributes.exclude.includes("mfaSecret"));
  assert.ok(db.User.options.scopes.withPassword.attributes.include.includes("mfaSecret"));
});

// ─── Rollenpruefung ─────────────────────────────────────────────

test("requireStaff lets ADMIN and SELLER through and blocks CUSTOMER", () => {
  const roleCheck = requireStaff[1];
  for (const role of ["ADMIN", "SELLER"]) {
    let passed = false;
    roleCheck({ user: { id: 1, role } }, mockRes(), () => {
      passed = true;
    });
    assert.equal(passed, true, `${role} should pass`);
  }
  const res = mockRes();
  roleCheck({ user: { id: 1, role: "CUSTOMER" } }, res, () => {
    assert.fail("CUSTOMER must not pass");
  });
  assert.equal(res.statusCode, 403);
});

test("staff-only routes reject CUSTOMER (403) and anonymous (401)", async () => {
  const cases = [
    ["GET", "/api/analytics/stats"],
    ["GET", "/api/delivery-places"],
    ["POST", "/api/delivery-places"],
    ["PATCH", "/api/delivery-places/1"],
    ["DELETE", "/api/delivery-places/1"],
    ["GET", "/api/delivery-costs"],
    ["GET", "/api/settings"],
    ["GET", "/api/crm/status"],
    ["GET", "/api/crm/status/1"],
    // Vertragsverwaltung nur im CRM
    ["GET", "/api/contracts"],
    ["GET", "/api/contracts/view/vertrag.pdf"],
    ["GET", "/api/contracts/signature/signatur.png"],
    ["POST", "/api/contracts/1/sign-link"],
    ["POST", "/api/contracts/1/share-link"],
    ["POST", "/api/contracts/1/share-link/revoke"],
    ["POST", "/api/contracts/generate-pdf/1"],
    ["POST", "/api/contracts/1/upload-contract"],
    ["PATCH", "/api/contracts/1/party-data"],
    ["PATCH", "/api/contracts/archive/1"],
    ["DELETE", "/api/contracts/1"],
    ["POST", "/api/mail/confirmation/resend/1"],
  ];

  await withServer(async (base) => {
    for (const [method, url] of cases) {
      const anon = await fetch(base + url, { method });
      assert.equal(anon.status, 401, `${method} ${url} anonymous`);

      const customer = await fetch(base + url, {
        method,
        headers: { "x-test-role": "CUSTOMER" },
      });
      assert.equal(customer.status, 403, `${method} ${url} as CUSTOMER`);
    }
  });
});

test("only ADMIN may create users via /api/auth/register", async () => {
  await withServer(async (base) => {
    const anon = await fetch(`${base}/api/auth/register`, { method: "POST" });
    assert.equal(anon.status, 401);
    for (const role of ["CUSTOMER", "SELLER"]) {
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "x-test-role": role },
      });
      assert.equal(res.status, 403, role);
    }
  });
});

test("checkout and signing routes stay public", async () => {
  await withServer(async (base) => {
    const publicCalls = [
      ["POST", "/api/contracts", {}],
      ["GET", "/api/contracts/sign/public/ungueltig", undefined],
      ["GET", "/api/contracts/share/ungueltig", undefined],
    ];
    for (const [method, url, body] of publicCalls) {
      const res = await fetch(base + url, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.notEqual(res.status, 401, `${method} ${url}`);
      assert.notEqual(res.status, 403, `${method} ${url}`);
    }
  });
});

// ─── Vertrags-Upload: keine Pfadmanipulation ueber :id ──────────

test("contract routes reject non-numeric ids before upload handling", async () => {
  await withServer(async (base) => {
    const traversal = await fetch(
      `${base}/api/contracts/%2F..%2F..%2F..%2Fpublic%2Fuploads%2Fx/upload-contract`,
      { method: "POST", headers: { "x-test-role": "ADMIN" } },
    );
    assert.equal(traversal.status, 400);

    const nonNumeric = await fetch(`${base}/api/contracts/abc/sign-link`, {
      method: "POST",
      headers: { "x-test-role": "ADMIN" },
    });
    assert.equal(nonNumeric.status, 400);
  });
});

test("contract upload filenames never contain user-controlled path parts", () => {
  const routeSource = require("fs").readFileSync(
    path.join(__dirname, "../../routes/contractRoute.js"),
    "utf8",
  );
  assert.match(routeSource, /vertrag_upload_\$\{contractId\}_\$\{crypto\.randomUUID\(\)\}\.pdf/);
  assert.doesNotMatch(routeSource, /path\.extname\(file\.originalname/);
});
