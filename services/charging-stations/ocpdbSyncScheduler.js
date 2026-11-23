"use strict";

const db = require("../../models");
const { logger } = require("../logging");
const {
  runLocationFull,
  runLocationDelta,
  runEvseDelta,
} = require("./ocpdbSync");

const PROCEDURES = [
  "refresh_status",
  "assign_operators",
  "mark_duplicates",
  "recompute_scope",
];
const FULL_CHECK_INTERVAL_MS = 15 * 60_000;

function isEnabled() {
  return String(process.env.CHARGING_SYNC_ENABLED ?? "false") === "true";
}

function parseIntervalMs(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseHour(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23
    ? parsed
    : fallback;
}

async function findMissingProcedures() {
  const rows = await db.sequelize.query(
    "SELECT ROUTINE_NAME AS name FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE'",
    { type: db.Sequelize.QueryTypes.SELECT },
  );
  const existing = new Set(rows.map((row) => row.name));
  return PROCEDURES.filter((name) => !existing.has(name));
}

/** Aufgabe, die nie doppelt läuft; Fehler hat runJob schon geloggt. */
function singleRun(task) {
  let isRunning = false;
  return async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await task();
    } catch {
      // bereits in SyncStates und im Log
    } finally {
      isRunning = false;
    }
  };
}

function startChargingSyncScheduler() {
  if (!isEnabled()) {
    console.log("[charging-sync] Scheduler disabled.");
    return null;
  }

  const evseIntervalMs = parseIntervalMs(
    process.env.CHARGING_SYNC_EVSE_INTERVAL_MS,
    60_000,
  );
  const locationIntervalMs = parseIntervalMs(
    process.env.CHARGING_SYNC_LOCATION_INTERVAL_MS,
    15 * 60_000,
  );
  const fullHourUtc = parseHour(process.env.CHARGING_SYNC_FULL_HOUR_UTC, 2);

  let lastFullDay = null;

  // Unbekannte EVSE-uids holt der reguläre location_delta nach; kein Vorziehen,
  // weil manche uids dauerhaft unbekannt bleiben.
  const locationDelta = singleRun(runLocationDelta);
  const evseDelta = singleRun(runEvseDelta);

  // Erstladung, solange es noch keinen erfolgreichen Lauf gibt; danach nachts.
  const locationFull = singleRun(async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const state = await db.SyncState.findByPk("location_full", {
      attributes: ["cursor_ts"],
    });
    const isNightly = now.getUTCHours() === fullHourUtc && lastFullDay !== day;
    if (state?.cursor_ts && !isNightly) return;
    if (isNightly) lastFullDay = day;
    await runLocationFull();
  });

  findMissingProcedures()
    .then((missing) => {
      if (missing.length) {
        logger(
          "warn",
          `[charging-sync] Prozeduren fehlen: ${missing.join(", ")}. Scheduler inaktiv.`,
        );
        return;
      }
      locationFull();
      evseDelta();
      setInterval(locationFull, FULL_CHECK_INTERVAL_MS);
      setInterval(evseDelta, evseIntervalMs);
      setInterval(locationDelta, locationIntervalMs);
    })
    .catch((error) =>
      logger("warn", `[charging-sync] Start fehlgeschlagen: ${error.message}`),
    );

  return true;
}

module.exports = { startChargingSyncScheduler };
