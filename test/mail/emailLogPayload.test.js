const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLogPayload,
  extractAttachmentMeta,
  NO_BODY_MAIL_TYPES,
} = require("../../services/mail/emailLogPayload");

test("buildLogPayload stores no body for otp and password_reset", () => {
  for (const mailType of NO_BODY_MAIL_TYPES) {
    const payload = buildLogPayload(
      mailType,
      {
        from: "sender@example.com",
        to: "user@example.com",
        subject: "Secret",
        text: "Code: 987654",
        html: "<b>987654</b>",
        attachments: [{ filename: "x.pdf", contentType: "application/pdf", size: 10 }],
      },
      { relatedUserId: 1 },
    );

    assert.equal(payload.bodyText, null);
    assert.equal(payload.bodyHtml, null);
    assert.equal(payload.attachmentCount, 0);
    assert.equal(payload.attachmentMeta, null);
    assert.equal(payload.toAddress, "user@example.com");
  }
});

test("buildLogPayload stores body for notification mails", () => {
  const payload = buildLogPayload(
    "custom",
    {
      from: "sender@example.com",
      to: "customer@example.com",
      subject: "Hello",
      text: "Plain body",
      html: "<p>HTML body</p>",
    },
    {},
  );

  assert.equal(payload.bodyText, "Plain body");
  assert.equal(payload.bodyHtml, "<p>HTML body</p>");
});

test("extractAttachmentMeta stores metadata only", () => {
  const result = extractAttachmentMeta([
    {
      filename: "vertrag.pdf",
      contentType: "application/pdf",
      content: Buffer.from("pdf-content"),
    },
  ]);

  assert.equal(result.attachmentCount, 1);
  const meta = JSON.parse(result.attachmentMeta);
  assert.equal(meta[0].filename, "vertrag.pdf");
});
