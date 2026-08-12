"use strict";

const { processDueJobs } = require("./followupService");

function isEnabled() {
  return String(process.env.FOLLOWUP_ENABLED ?? "true") !== "false";
}

function parseIntervalMs(value, fallback = 60_000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function startFollowupScheduler() {
  if (!isEnabled()) {
    console.log("[followup] Scheduler disabled.");
    return null;
  }

  let isRunning = false;
  const intervalMs = parseIntervalMs(
    process.env.FOLLOWUP_SCHEDULER_INTERVAL_MS,
    60_000,
  );

  const run = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const result = await processDueJobs();
      if (result.checked > 0) {
        console.log(
          `[followup] Processed jobs: checked=${result.checked}, sent=${result.sent}, cancelled=${result.cancelled}, failed=${result.failed}, skipped=${result.skipped}`,
        );
      }
    } catch (error) {
      console.error("[followup] Scheduler failed:", error);
    } finally {
      isRunning = false;
    }
  };

  run();
  return setInterval(run, intervalMs);
}

module.exports = { startFollowupScheduler };
