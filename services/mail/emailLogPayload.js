"use strict";

const NO_BODY_MAIL_TYPES = new Set(["otp", "password_reset"]);

function normalizeAddressField(value) {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return String(value);
}

function extractAttachmentMeta(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { attachmentCount: 0, attachmentMeta: null };
  }

  const meta = attachments.map((attachment) => ({
    filename: attachment.filename || attachment.name || null,
    contentType: attachment.contentType || attachment.mimetype || null,
    size:
      attachment.size ??
      (Buffer.isBuffer(attachment.content)
        ? attachment.content.length
        : null),
  }));

  return {
    attachmentCount: meta.length,
    attachmentMeta: JSON.stringify(meta),
  };
}

function buildLogPayload(mailType, mailPayload, context = {}) {
  const { attachmentCount, attachmentMeta } = extractAttachmentMeta(
    mailPayload.attachments,
  );
  const storeBody = !NO_BODY_MAIL_TYPES.has(mailType);

  return {
    mailType,
    fromAddress: mailPayload.from ? String(mailPayload.from) : null,
    toAddress: normalizeAddressField(mailPayload.to),
    ccAddress: normalizeAddressField(mailPayload.cc),
    subject: mailPayload.subject ? String(mailPayload.subject) : null,
    bodyText: storeBody ? (mailPayload.text ?? null) : null,
    bodyHtml: storeBody ? (mailPayload.html ?? null) : null,
    attachmentCount: storeBody ? attachmentCount : 0,
    attachmentMeta: storeBody ? attachmentMeta : null,
    relatedUserId: context.relatedUserId ?? null,
    relatedContractId: context.relatedContractId ?? null,
  };
}

module.exports = {
  NO_BODY_MAIL_TYPES,
  normalizeAddressField,
  extractAttachmentMeta,
  buildLogPayload,
};
