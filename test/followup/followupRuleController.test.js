"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../../models");
const {
  createFollowupRule,
  updateFollowupRule,
  getFollowupRuleById,
  _internals,
} = require("../../controllers/followupController");

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

const validPayload = {
  key: "test_help_mail",
  name: "Test Hilfe",
  trigger_event: "cart_user_attached",
  timing_type: "after_event",
  delay_minutes: 15,
  cancel_conditions: ["cart_completed"],
  subject: "Hilfe nötig?",
  body_html: "<p>Hallo {{firstName}}</p>",
  is_active: true,
};

test("validateRulePayload rejects delay_minutes < 1", () => {
  const { errors } = _internals.validateRulePayload(
    { ...validPayload, delay_minutes: 0 },
    { isCreate: true },
  );
  assert.ok(errors.some((e) => e.includes("delay_minutes")));
});

test("validateRulePayload rejects invalid trigger_event", () => {
  const { errors } = _internals.validateRulePayload(
    { ...validPayload, trigger_event: "unknown_event" },
    { isCreate: true },
  );
  assert.ok(errors.some((e) => e.includes("trigger_event")));
});

test("validateRulePayload rejects invalid key", () => {
  const { errors } = _internals.validateRulePayload(
    { ...validPayload, key: "Bad-Key!" },
    { isCreate: true },
  );
  assert.ok(errors.some((e) => e.includes("key")));
});

test("createFollowupRule returns 201 for valid payload", async () => {
  const originalFindOne = db.FollowupRule.findOne;
  const originalCreate = db.FollowupRule.create;

  db.FollowupRule.findOne = async () => null;
  db.FollowupRule.create = async (data) => ({
    id: "rule-new",
    ...data,
  });

  const req = { body: validPayload };
  const res = createMockRes();

  try {
    await createFollowupRule(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.rule.key, "test_help_mail");
    assert.equal(res.body.rule.delay_minutes, 15);
  } finally {
    db.FollowupRule.findOne = originalFindOne;
    db.FollowupRule.create = originalCreate;
  }
});

test("createFollowupRule returns 400 for duplicate key", async () => {
  const originalFindOne = db.FollowupRule.findOne;
  db.FollowupRule.findOne = async () => ({ id: "existing" });

  const req = { body: validPayload };
  const res = createMockRes();

  try {
    await createFollowupRule(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /key already exists/i);
  } finally {
    db.FollowupRule.findOne = originalFindOne;
  }
});

test("createFollowupRule returns 400 for invalid trigger_event", async () => {
  const req = {
    body: { ...validPayload, trigger_event: "before_start" },
  };
  const res = createMockRes();
  await createFollowupRule(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /trigger_event/i);
});

test("updateFollowupRule updates subject/delay and keeps key immutable", async () => {
  const originalFindByPk = db.FollowupRule.findByPk;
  let updatedFields = null;

  db.FollowupRule.findByPk = async () => ({
    id: "rule-1",
    key: "checkout_help",
    name: "Checkout-Hilfe",
    subject: "Alt",
    delay_minutes: 10,
    async update(fields) {
      updatedFields = fields;
      Object.assign(this, fields);
      return this;
    },
  });

  const req = {
    params: { id: "rule-1" },
    body: {
      key: "should_be_ignored",
      name: "Checkout-Hilfe neu",
      trigger_event: "cart_user_attached",
      timing_type: "after_event",
      delay_minutes: 30,
      cancel_conditions: ["cart_completed", "car_unavailable"],
      subject: "Neuer Betreff",
      body_html: "<p>Neu</p>",
      is_active: false,
    },
  };
  const res = createMockRes();

  try {
    await updateFollowupRule(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(updatedFields.subject, "Neuer Betreff");
    assert.equal(updatedFields.delay_minutes, 30);
    assert.equal(updatedFields.is_active, false);
    assert.equal(updatedFields.key, undefined);
    assert.equal(res.body.rule.key, "checkout_help");
  } finally {
    db.FollowupRule.findByPk = originalFindByPk;
  }
});

test("getFollowupRuleById returns 404 when missing", async () => {
  const originalFindByPk = db.FollowupRule.findByPk;
  db.FollowupRule.findByPk = async () => null;

  const req = { params: { id: "missing" } };
  const res = createMockRes();

  try {
    await getFollowupRuleById(req, res);
    assert.equal(res.statusCode, 404);
  } finally {
    db.FollowupRule.findByPk = originalFindByPk;
  }
});
