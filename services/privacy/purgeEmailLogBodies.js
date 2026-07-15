"use strict";

const { Op } = require("sequelize");
const { EmailLog } = require("../../models");

const REDACTED = "[ANONYMIZED]";

function parseDays(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cutoffDateFromDays(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

async function purgeEmailLogBodies({ days } = {}) {
  const thresholdDays = parseDays(
    days ?? process.env.EMAIL_LOG_BODY_RETENTION_DAYS,
    90,
  );
  const cutoffDate = cutoffDateFromDays(thresholdDays);

  const [purgedCount] = await EmailLog.update(
    {
      bodyText: null,
      bodyHtml: null,
      attachmentMeta: null,
      attachmentCount: 0,
    },
    {
      where: {
        createdAt: { [Op.lte]: cutoffDate },
        [Op.or]: [
          { bodyText: { [Op.ne]: null } },
          { bodyHtml: { [Op.ne]: null } },
          { attachmentMeta: { [Op.ne]: null } },
        ],
      },
    },
  );

  return {
    thresholdDays,
    cutoffDate,
    purgedCount,
  };
}

async function anonymizeOldEmailLogMetadata({ days } = {}) {
  const thresholdDays = parseDays(
    days ?? process.env.EMAIL_LOG_METADATA_RETENTION_DAYS,
    730,
  );
  const cutoffDate = cutoffDateFromDays(thresholdDays);

  const [anonymizedCount] = await EmailLog.update(
    {
      toAddress: REDACTED,
      ccAddress: null,
      fromAddress: REDACTED,
      subject: REDACTED,
      errorMessage: null,
    },
    {
      where: {
        createdAt: { [Op.lte]: cutoffDate },
        toAddress: { [Op.ne]: REDACTED },
      },
    },
  );

  return {
    thresholdDays,
    cutoffDate,
    anonymizedCount,
  };
}

async function maintainEmailLogRetention(options = {}) {
  const bodyResult = await purgeEmailLogBodies(options);
  const metadataResult = await anonymizeOldEmailLogMetadata(options);

  return {
    bodyResult,
    metadataResult,
  };
}

module.exports = {
  purgeEmailLogBodies,
  anonymizeOldEmailLogMetadata,
  maintainEmailLogRetention,
};
