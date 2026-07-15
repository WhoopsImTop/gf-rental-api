"use strict";

const { anonymizeOldOrders } = require("./anonymizeOldOrders");
const { maintainEmailLogRetention } = require("./purgeEmailLogBodies");

function isEnabled() {
  return String(process.env.ANONYMIZE_ORDERS_ENABLED ?? "true") !== "false";
}

function isEmailLogPurgeEnabled() {
  return String(process.env.EMAIL_LOG_PURGE_ENABLED ?? "true") !== "false";
}

function parseIntervalHours(value, fallback = 24) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function startAnonymizationScheduler() {
  if (!isEnabled() && !isEmailLogPurgeEnabled()) {
    console.log("[privacy] Privacy scheduler disabled.");
    return null;
  }

  let isRunning = false;
  const intervalHours = parseIntervalHours(process.env.ANONYMIZE_ORDERS_INTERVAL_HOURS, 24);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      if (isEnabled()) {
        const result = await anonymizeOldOrders();
        console.log(
          `[privacy] Order anonymization done: checked=${result.checkedCount}, anonymized=${result.anonymizedCount}, cutoffDays=${result.thresholdDays}`,
        );
      }

      if (isEmailLogPurgeEnabled()) {
        const emailLogResult = await maintainEmailLogRetention();
        console.log(
          `[privacy] Email log retention done: bodiesPurged=${emailLogResult.bodyResult.purgedCount}, metadataAnonymized=${emailLogResult.metadataResult.anonymizedCount}, bodyDays=${emailLogResult.bodyResult.thresholdDays}, metadataDays=${emailLogResult.metadataResult.thresholdDays}`,
        );
      }
    } catch (error) {
      console.error("[privacy] Privacy scheduler failed:", error);
    } finally {
      isRunning = false;
    }
  };

  // Run once after startup, then periodically.
  run();
  return setInterval(run, intervalMs);
}

module.exports = { startAnonymizationScheduler };
