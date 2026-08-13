"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../../models");
const followupService = require("../../services/followup/followupService");
const mailService = require("../../services/mailService");

test("evaluateCancelReason returns cart_completed when cart is done", () => {
  const reason = followupService.evaluateCancelReason(
    { cancel_conditions: ["cart_completed"] },
    { completed: true },
  );
  assert.equal(reason, "cart_completed");
});

test("evaluateCancelReason returns car_unavailable only when color isOrdered", () => {
  const reason = followupService.evaluateCancelReason(
    { cancel_conditions: ["cart_completed", "car_unavailable"] },
    {
      completed: false,
      car: { status: "reserved" },
      color: { isOrdered: true, availableInDays: 10 },
    },
  );
  assert.equal(reason, "car_unavailable");
});

test("evaluateCancelReason ignores car status and availableInDays", () => {
  const reason = followupService.evaluateCancelReason(
    { cancel_conditions: ["cart_completed", "car_unavailable"] },
    {
      completed: false,
      car: { status: "reserved" },
      color: { isOrdered: false, availableInDays: 10, needToBeOrdered: true },
    },
  );
  assert.equal(reason, null);
});

test("evaluateCancelReason returns null when cart open and color not ordered", () => {
  const reason = followupService.evaluateCancelReason(
    { cancel_conditions: ["cart_completed", "car_unavailable"] },
    {
      completed: false,
      car: { status: "available" },
      color: { isOrdered: false },
    },
  );
  assert.equal(reason, null);
});

test("resolveCarImageUrl reads color media url", () => {
  assert.equal(
    followupService.resolveCarImageUrl({
      color: { media: { url: " https://cdn.example/car.jpg " } },
    }),
    "https://cdn.example/car.jpg",
  );
  assert.equal(followupService.resolveCarImageUrl({ color: {} }), null);
});

test("buildCarImageHtml returns SafeString img markup", () => {
  const html = followupService.buildCarImageHtml(
    "https://cdn.example/car.jpg",
    "VW ID.3",
  );
  assert.match(String(html), /src="https:\/\/cdn\.example\/car\.jpg"/);
  assert.match(String(html), /alt="VW ID\.3"/);
  assert.equal(followupService.buildCarImageHtml(null, "x"), "");
});

test("scheduleForCart is idempotent for the same cart/rule", async () => {
  const originalCartFind = db.Cart.findByPk;
  const originalRuleFind = db.FollowupRule.findAll;
  const originalJobFindOne = db.FollowupJob.findOne;
  const originalJobCreate = db.FollowupJob.create;
  const originalJobUpdate = db.FollowupJob.prototype?.update;

  let createCalls = 0;
  const existingPending = {
    id: "job-existing",
    user_id: 7,
    to_email: null,
    car_abo_id: 3,
    status: "pending",
    async update() {
      return this;
    },
  };

  db.Cart.findByPk = async () => ({
    id: 42,
    userId: 7,
    completed: false,
    carAboId: 3,
  });
  db.FollowupRule.findAll = async () => [
    { id: "rule-1", delay_minutes: 10 },
    { id: "rule-2", delay_minutes: 4320 },
  ];

  let findOneCalls = 0;
  db.FollowupJob.findOne = async () => {
    findOneCalls += 1;
    // First call per rule on first schedule: no existing → create
    // After creates, subsequent finds return pending job
    if (createCalls < 2) return null;
    return existingPending;
  };
  db.FollowupJob.create = async () => {
    createCalls += 1;
    return { id: `job-${createCalls}` };
  };

  try {
    const first = await followupService.scheduleForCart(42);
    const second = await followupService.scheduleForCart(42);
    assert.equal(first.created, 2);
    assert.equal(second.created, 0);
    assert.equal(createCalls, 2);
  } finally {
    db.Cart.findByPk = originalCartFind;
    db.FollowupRule.findAll = originalRuleFind;
    db.FollowupJob.findOne = originalJobFindOne;
    db.FollowupJob.create = originalJobCreate;
  }
});

test("scheduleForCart works with email only (OTP request, no user yet)", async () => {
  const originalCartFind = db.Cart.findByPk;
  const originalRuleFind = db.FollowupRule.findAll;
  const originalJobFindOne = db.FollowupJob.findOne;
  const originalJobCreate = db.FollowupJob.create;

  let createdPayload = null;

  db.Cart.findByPk = async () => ({
    id: 55,
    userId: null,
    completed: false,
    carAboId: 1,
  });
  db.FollowupRule.findAll = async () => [{ id: "rule-1", delay_minutes: 10 }];
  db.FollowupJob.findOne = async () => null;
  db.FollowupJob.create = async (payload) => {
    createdPayload = payload;
    return { id: "job-otp" };
  };

  try {
    const result = await followupService.scheduleForCart(55, {
      email: "lead@example.com",
    });
    assert.equal(result.created, 1);
    assert.equal(createdPayload.user_id, null);
    assert.equal(createdPayload.to_email, "lead@example.com");
  } finally {
    db.Cart.findByPk = originalCartFind;
    db.FollowupRule.findAll = originalRuleFind;
    db.FollowupJob.findOne = originalJobFindOne;
    db.FollowupJob.create = originalJobCreate;
  }
});

test("scheduleForCart without user and without email creates nothing", async () => {
  const originalCartFind = db.Cart.findByPk;
  db.Cart.findByPk = async () => ({
    id: 56,
    userId: null,
    completed: false,
  });

  try {
    const result = await followupService.scheduleForCart(56);
    assert.equal(result.created, 0);
  } finally {
    db.Cart.findByPk = originalCartFind;
  }
});

test("resolveFirstName falls back for nameless OTP users", () => {
  assert.equal(followupService.resolveFirstName({ firstName: null }), "du");
  assert.equal(followupService.resolveFirstName({ firstName: "  " }), "du");
  assert.equal(followupService.resolveFirstName({ firstName: "Ada" }), "Ada");
});

test("processDueJobs sends to to_email when user has no name", async () => {
  const originalFindAll = db.FollowupJob.findAll;
  const originalUpdate = db.FollowupJob.update;
  const originalFindByPk = db.FollowupJob.findByPk;
  const originalSend = mailService.sendNotificationEmail;

  let sendCalls = 0;
  const updates = [];

  db.FollowupJob.findAll = async () => [{ id: "job-otp-2", status: "pending" }];
  db.FollowupJob.update = async (values, options) => {
    updates.push({ values, options });
    if (options.where.status === "pending") return [1];
    return [1];
  };
  db.FollowupJob.findByPk = async () => ({
    id: "job-otp-2",
    user_id: null,
    to_email: "otp-only@example.com",
    rule: {
      cancel_conditions: ["cart_completed"],
      subject: "Hilfe, {{firstName}}?",
      body_html: "<p>Hallo {{firstName}}</p>",
    },
    cart: {
      completed: false,
      accessToken: "tok",
      car: { status: "available", displayName: "ID.3" },
      color: { isOrdered: false },
    },
    user: null,
  });
  mailService.sendNotificationEmail = async (email, _cc, subject) => {
    sendCalls += 1;
    assert.equal(email, "otp-only@example.com");
    assert.match(subject, /du/);
    return true;
  };

  try {
    const summary = await followupService.processDueJobs({ limit: 10 });
    assert.equal(summary.sent, 1);
    assert.equal(sendCalls, 1);
  } finally {
    db.FollowupJob.findAll = originalFindAll;
    db.FollowupJob.update = originalUpdate;
    db.FollowupJob.findByPk = originalFindByPk;
    mailService.sendNotificationEmail = originalSend;
  }
});


test("cancelForCart updates pending jobs", async () => {
  const originalUpdate = db.FollowupJob.update;
  let captured = null;

  db.FollowupJob.update = async (values, options) => {
    captured = { values, options };
    return [3];
  };

  try {
    const result = await followupService.cancelForCart(99, "cart_completed");
    assert.equal(result.cancelled, 3);
    assert.equal(captured.values.status, "cancelled");
    assert.equal(captured.values.cancel_reason, "cart_completed");
    assert.equal(captured.options.where.cart_id, 99);
    assert.equal(captured.options.where.status, "pending");
  } finally {
    db.FollowupJob.update = originalUpdate;
  }
});

test("processDueJobs cancels when car unavailable without sending mail", async () => {
  const originalFindAll = db.FollowupJob.findAll;
  const originalUpdate = db.FollowupJob.update;
  const originalFindByPk = db.FollowupJob.findByPk;
  const originalSend = mailService.sendNotificationEmail;

  let sendCalls = 0;
  const updates = [];

  db.FollowupJob.findAll = async () => [{ id: "job-1", status: "pending" }];
  db.FollowupJob.update = async (values, options) => {
    updates.push({ values, options });
    if (options.where.status === "pending") return [1];
    return [1];
  };
  db.FollowupJob.findByPk = async () => ({
    id: "job-1",
    rule: {
      cancel_conditions: ["cart_completed", "car_unavailable"],
      subject: "Test",
      body_html: "<p>Hi</p>",
    },
    cart: {
      completed: false,
      accessToken: "abc",
      car: { status: "available" },
      color: { isOrdered: true },
    },
    user: { id: 1, email: "a@b.de", firstName: "Ada" },
  });
  mailService.sendNotificationEmail = async () => {
    sendCalls += 1;
    return true;
  };

  try {
    const summary = await followupService.processDueJobs({ limit: 10 });
    assert.equal(summary.cancelled, 1);
    assert.equal(summary.sent, 0);
    assert.equal(sendCalls, 0);
    assert.ok(
      updates.some(
        (u) =>
          u.values.status === "cancelled" &&
          u.values.cancel_reason === "car_unavailable",
      ),
    );
  } finally {
    db.FollowupJob.findAll = originalFindAll;
    db.FollowupJob.update = originalUpdate;
    db.FollowupJob.findByPk = originalFindByPk;
    mailService.sendNotificationEmail = originalSend;
  }
});

test("processDueJobs sends mail and marks job sent", async () => {
  const originalFindAll = db.FollowupJob.findAll;
  const originalUpdate = db.FollowupJob.update;
  const originalFindByPk = db.FollowupJob.findByPk;
  const originalSend = mailService.sendNotificationEmail;

  let sendCalls = 0;
  const updates = [];

  db.FollowupJob.findAll = async () => [{ id: "job-2", status: "pending" }];
  db.FollowupJob.update = async (values, options) => {
    updates.push({ values, options });
    if (options.where.status === "pending") return [1];
    return [1];
  };
  db.FollowupJob.findByPk = async () => ({
    id: "job-2",
    rule: {
      cancel_conditions: ["cart_completed", "car_unavailable"],
      subject: "Noch verfügbar: {{carName}}",
      body_html: "<p>Hallo {{firstName}}, {{carName}}</p>",
    },
    cart: {
      completed: false,
      accessToken: "tok123",
      car: { status: "available", displayName: "VW ID.3" },
      color: {
        isOrdered: false,
        media: { url: "https://cdn.example/id3.jpg" },
      },
    },
    user: { id: 5, email: "kunde@example.com", firstName: "Elias" },
  });
  mailService.sendNotificationEmail = async (email, _cc, subject, html, _att, options) => {
    sendCalls += 1;
    assert.equal(email, "kunde@example.com");
    assert.match(subject, /VW ID\.3/);
    assert.match(html, /src="https:\/\/cdn\.example\/id3\.jpg"/);
    assert.equal(options.mailType, "followup");
    return true;
  };

  try {
    const summary = await followupService.processDueJobs({ limit: 10 });
    assert.equal(summary.sent, 1);
    assert.equal(sendCalls, 1);
    assert.ok(updates.some((u) => u.values.status === "sent"));
  } finally {
    db.FollowupJob.findAll = originalFindAll;
    db.FollowupJob.update = originalUpdate;
    db.FollowupJob.findByPk = originalFindByPk;
    mailService.sendNotificationEmail = originalSend;
  }
});
