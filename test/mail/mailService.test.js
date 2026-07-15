const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLogPayload,
  extractAttachmentMeta,
} = require("../../services/mail/emailLogPayload");

test("sendAndLog writes skipped_dev when SMTP_HOST is unset", async () => {
  const originalHost = process.env.SMTP_HOST;
  process.env.SMTP_HOST = "";

  const created = [];
  delete require.cache[require.resolve("../../services/mailService")];
  const mailServiceModule = require("../../services/mailService");
  const originalPersist = mailServiceModule._internals.persistEmailLog;
  mailServiceModule._internals.persistEmailLog = async (data) => {
    created.push(data);
  };

  try {
    const result = await mailServiceModule._internals.sendAndLog({
      mailType: "otp",
      mailPayload: {
        from: "test@example.com",
        to: "user@example.com",
        subject: "Test",
        text: "Code 123456",
        html: "<b>123456</b>",
      },
    });

    assert.equal(result.skipped, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].status, "skipped_dev");
    assert.equal(created[0].mailType, "otp");
    assert.equal(created[0].bodyText, null);
    assert.equal(created[0].bodyHtml, null);
  } finally {
    mailServiceModule._internals.persistEmailLog = originalPersist;
    delete require.cache[require.resolve("../../services/mailService")];
    if (originalHost) {
      process.env.SMTP_HOST = originalHost;
    } else {
      delete process.env.SMTP_HOST;
    }
  }
});

test("sendAndLog records sent status with jsonTransport", async () => {
  const nodemailer = require("nodemailer");
  const originalHost = process.env.SMTP_HOST;
  process.env.SMTP_HOST = "smtp.test.local";

  const created = [];
  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = (options) =>
    originalCreateTransport.call(nodemailer, { jsonTransport: true });

  delete require.cache[require.resolve("../../services/mailService")];
  const reloaded = require("../../services/mailService");
  reloaded._internals.persistEmailLog = async (data) => {
    created.push(data);
  };

  try {
    await reloaded._internals.sendAndLog({
      mailType: "custom",
      mailPayload: {
        from: "test@example.com",
        to: "customer@example.com",
        subject: "Custom Mail",
        text: "Hello customer",
        html: "<p>Hello customer</p>",
      },
    });

    assert.equal(created.length, 1);
    assert.equal(created[0].status, "sent");
    assert.equal(created[0].mailType, "custom");
    assert.ok(created[0].messageId);
    assert.equal(created[0].bodyText, "Hello customer");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    delete require.cache[require.resolve("../../services/mailService")];
    require("../../services/mailService");

    if (originalHost) {
      process.env.SMTP_HOST = originalHost;
    } else {
      delete process.env.SMTP_HOST;
    }
  }
});

test("mailService exports buildLogPayload helper", () => {
  const payload = buildLogPayload(
    "notification",
    {
      from: "a@b.de",
      to: "c@d.de",
      subject: "Test",
      text: "Hello",
    },
    {},
  );

  assert.equal(payload.bodyText, "Hello");
});

test("extractAttachmentMeta is re-exported from mailService internals", () => {
  const { extractAttachmentMeta: fromMailService } =
    require("../../services/mailService")._internals;
  const result = fromMailService([]);
  assert.equal(result.attachmentCount, 0);
});
