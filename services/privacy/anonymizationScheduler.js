"use strict";

const { anonymizeOldOrders } = require("./anonymizeOldOrders");

function isEnabled() {
  return String(process.env.ANONYMIZE_ORDERS_ENABLED ?? "true") !== "false";
}

function parseIntervalHours(value, fallback = 24) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function startAnonymizationScheduler() {
  if (!isEnabled()) {
    console.log("[privacy] Order anonymization scheduler disabled.");
    return null;
  }

  let isRunning = false;
  const intervalHours = parseIntervalHours(process.env.ANONYMIZE_ORDERS_INTERVAL_HOURS, 24);
  const intervalMs = intervalHours * 60 * 60 * 1000;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const result = await anonymizeOldOrders();
      console.log(
        `[privacy] Order anonymization done: checked=${result.checkedCount}, anonymized=${result.anonymizedCount}, cutoffDays=${result.thresholdDays}`,
      );
    } catch (error) {
      console.error("[privacy] Order anonymization failed:", error);
    } finally {
      isRunning = false;
    }
  };

  // Run once after startup, then periodically.
  run();
  return setInterval(run, intervalMs);
}

module.exports = { startAnonymizationScheduler };
