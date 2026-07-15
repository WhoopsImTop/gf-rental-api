const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listEmailLogs,
  getEmailLogById,
} = require("../../controllers/emailController");

const VALID_MAIL_TYPES = new Set([
  "otp",
  "password_reset",
  "notification",
  "error",
  "custom",
  "contact",
  "feedback",
  "admin_notification",
]);

const VALID_STATUSES = new Set(["sent", "failed", "skipped_dev"]);

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
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

test("listEmailLogs returns paginated logs", async () => {
  const originalFindAndCountAll = require("../../models").EmailLog.findAndCountAll;
  require("../../models").EmailLog.findAndCountAll = async () => ({
    rows: [{ id: 1, mailType: "custom", status: "sent" }],
    count: 1,
  });

  const req = { query: { page: "1", limit: "10" } };
  const res = createMockRes();

  try {
    await listEmailLogs(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.logs.length, 1);
    assert.equal(res.body.pagination.total, 1);
  } finally {
    require("../../models").EmailLog.findAndCountAll = originalFindAndCountAll;
  }
});

test("listEmailLogs ignores invalid filter values", async () => {
  const originalFindAndCountAll = require("../../models").EmailLog.findAndCountAll;
  let capturedWhere = null;

  require("../../models").EmailLog.findAndCountAll = async (options) => {
    capturedWhere = options.where;
    return { rows: [], count: 0 };
  };

  const req = {
    query: {
      mailType: "invalid",
      status: "invalid",
      search: "test@example.com",
    },
  };
  const res = createMockRes();

  try {
    await listEmailLogs(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(capturedWhere.mailType, undefined);
    assert.equal(capturedWhere.status, undefined);
    assert.ok(capturedWhere[require("../../models").Sequelize.Op.or]);
  } finally {
    require("../../models").EmailLog.findAndCountAll = originalFindAndCountAll;
  }
});

test("getEmailLogById returns 404 when missing", async () => {
  const originalFindByPk = require("../../models").EmailLog.findByPk;
  require("../../models").EmailLog.findByPk = async () => null;

  const req = { params: { id: "999" } };
  const res = createMockRes();

  try {
    await getEmailLogById(req, res);
    assert.equal(res.statusCode, 404);
  } finally {
    require("../../models").EmailLog.findByPk = originalFindByPk;
  }
});

test("getEmailLogById returns log detail", async () => {
  const originalFindByPk = require("../../models").EmailLog.findByPk;
  require("../../models").EmailLog.findByPk = async () => ({
    id: 5,
    mailType: "otp",
    status: "sent",
    bodyText: "[REDACTED]",
  });

  const req = { params: { id: "5" } };
  const res = createMockRes();

  try {
    await getEmailLogById(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.log.id, 5);
  } finally {
    require("../../models").EmailLog.findByPk = originalFindByPk;
  }
});

test("email log enums stay in sync with model", () => {
  assert.equal(VALID_MAIL_TYPES.size, 8);
  assert.equal(VALID_STATUSES.size, 3);
});
