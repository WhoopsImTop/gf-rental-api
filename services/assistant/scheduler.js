"use strict";

const config = require("./config");
const { isConfigured, getSupabase, unwrap } = require("./db");
const { runSyncNow, markStaleRuns, SyncAlreadyRunningError } = require("./sync/syncRunner");
const { logger } = require("../logging");

const CHECK_INTERVAL_MS = 15 * 60_000;

function berlinParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Löscht Test-Chat-Verläufe nach Ablauf der Löschfrist (Feedback bleibt als Testfall erhalten). */
async function purgeOldConversations() {
  const cutoff = new Date(Date.now() - config.CHAT_RETENTION_DAYS * 86_400_000).toISOString();
  unwrap(await getSupabase().from("kb_conversations").delete().lt("updated_at", cutoff), "kb_conversations purge");
}

/**
 * Startet den Hintergrund-Job des Assistenten:
 * - beim Start: abgebrochene Sync-Läufe als fehlgeschlagen markieren
 * - täglich: Chat-Verläufe nach Löschfrist entfernen
 * - optional (ASSISTANT_SYNC_ENABLED=true): nächtliches inkrementelles Einlernen
 */
function startAssistantScheduler() {
  if (!isConfigured()) {
    console.log("[assistant] Nicht konfiguriert – Scheduler inaktiv.");
    return null;
  }

  let lastDailyRun = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { day, hour } = berlinParts();
      if (hour === config.SYNC_HOUR && lastDailyRun !== day) {
        lastDailyRun = day;
        await purgeOldConversations();
        if (config.SYNC_SCHEDULER_ENABLED) {
          const run = await runSyncNow({ mode: "incremental", triggeredBy: "scheduler" });
          logger("info", `[assistant] Nächtlicher Sync ${run.id}: ${run.status}`);
        }
      }
    } catch (error) {
      if (!(error instanceof SyncAlreadyRunningError)) {
        logger("warn", `[assistant] Scheduler-Fehler: ${error.message}`);
      }
    } finally {
      running = false;
    }
  };

  markStaleRuns().catch((error) => logger("warn", `[assistant] Stale-Check fehlgeschlagen: ${error.message}`));
  return setInterval(tick, CHECK_INTERVAL_MS);
}

module.exports = { startAssistantScheduler, purgeOldConversations };
