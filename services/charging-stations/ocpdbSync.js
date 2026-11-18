"use strict";

// Ladesäulen-Sync aus MobiData BW (OCPDB) in Locations/Evses.
// operator_id, state, evse_*, enbw_plus, in_scope und canonical_location_id
// setzen ausschließlich die Prozeduren, nie dieser Code.

const axios = require("axios");
const db = require("../../models");
const { logger } = require("../logging");

const { Op, QueryTypes } = db.Sequelize;

const BATCH_SIZE = 500;
const MAX_PAGE_SIZE = 1000;
const MIN_REQUEST_INTERVAL_MS = 1000;
const CURSOR_REWIND_MS = 2 * 60_000;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60_000;
// Nach einem Ausfall (alle Versuche erfolglos) fragen auch die anderen Jobs so lange nicht an.
const OUTAGE_PAUSE_MS = 5 * 60_000;
const DUPLICATE_RADIUS_M = 40;
const MAX_BROKEN_IN_LOG = 20;

const EVSE_DELTA_EXCLUDED_SOURCES = "bnetza_api,bnetza_excel";

// Beide Location-Jobs schreiben dieselben Zeilen und rufen dieselben Prozeduren auf.
const LOCKS = {
  location_full: "ocpdb_sync_location",
  location_delta: "ocpdb_sync_location",
  evse_delta: "ocpdb_sync_evse",
};

const LOCATION_UPDATE_FIELDS = [
  "source_uid",
  "original_id",
  "operator_name_raw",
  "address",
  "city",
  "lat",
  "lon",
  "geom",
  "max_power_kw",
  "last_seen_at",
  "is_active",
];
const EVSE_UPDATE_FIELDS = [
  "location_id",
  "connectors",
  "status",
  "status_changed_at",
  "last_seen_at",
  "is_active",
];
const EVSE_STATUS_FIELDS = ["status", "status_changed_at", "last_seen_at"];

const EVSE_STATUSES = new Set([
  "STATIC",
  "AVAILABLE",
  "CHARGING",
  "RESERVED",
  "BLOCKED",
  "INOPERATIVE",
  "OUTOFORDER",
  "PLANNED",
  "REMOVED",
  "UNKNOWN",
]);
const CONNECTOR_LABELS = {
  IEC_62196_T2_COMBO: "CCS",
  IEC_62196_T2: "Typ2",
};
const ID_PATTERN = /^\d{1,19}$/;

// In Tests ersetzbar, damit Retry und Mindestabstand nicht echt warten.
const clock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Gilt für alle Jobs gemeinsam: Abstand zwischen Abrufen und Pause nach Ausfall oder Retry-After.
const throttle = { lastRequestAt: 0, pausedUntil: 0, queue: Promise.resolve() };

// ─── Konfiguration (.env) ───────────────────────────────────────

const envInt = (name, fallback) => {
  const parsed = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const apiSettings = () => ({
  baseUrl: (
    process.env.OCPDB_BASE_URL || "https://api.mobidata-bw.de/ocpdb"
  ).replace(/\/$/, ""),
  locationsPath: process.env.OCPDB_LOCATIONS_PATH || "/api/public/v1/locations",
  evsesPath: process.env.OCPDB_EVSES_PATH || "/api/public/ocpi/3.0/evses",
  pageSize: Math.min(envInt("OCPDB_PAGE_SIZE", MAX_PAGE_SIZE), MAX_PAGE_SIZE),
  timeoutMs: envInt("OCPDB_TIMEOUT_MS", 30_000),
  minIntervalMs: Math.max(
    envInt("OCPDB_MIN_REQUEST_INTERVAL_MS", MIN_REQUEST_INTERVAL_MS),
    MIN_REQUEST_INTERVAL_MS,
  ),
  userAgent:
    process.env.OCPDB_USER_AGENT ||
    "GrueneFlotte-Ladesaeulen-Sync/1.0 (+https://gruene-flotte.com)",
});

/** Parameter für recompute_scope(); leeres Polygon = kein Sperrgebiet. */
const scopeSettings = () => {
  const polygon = String(
    process.env.CHARGING_FREIBURG_POLYGON_WKT ?? "",
  ).trim();
  if (polygon && !/^POLYGON\s*\(\(/i.test(polygon)) {
    throw new Error(
      "CHARGING_FREIBURG_POLYGON_WKT ist kein POLYGON((lon lat, ...)).",
    );
  }
  return {
    polygon: polygon || null,
    showUnknown:
      String(process.env.CHARGING_SHOW_UNKNOWN ?? "0") === "1" ? 1 : 0,
  };
};

// ─── Mapping API -> Zeilen ──────────────────────────────────────

const text = (value, maxLength) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const toId = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value);
  return ID_PATTERN.test(id) ? id : null;
};

const toDate = (value) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toCoordinate = (value) =>
  value === null || value === undefined || value === ""
    ? Number.NaN
    : Number(value);

/** Watt -> kW mit einer Nachkommastelle, null bei fehlendem Wert. */
const toKw = (watts) => {
  const value = Number(watts);
  return Number.isFinite(value) && value > 0
    ? Math.round(value / 100) / 10
    : null;
};

const normalizeStatus = (status) =>
  EVSE_STATUSES.has(status) ? status : "UNKNOWN";

const later = (current, candidate) =>
  candidate && (!current || candidate > current) ? candidate : current;

/** z. B. "CCS 150kW | Typ2 22kW"; unbekannte Standards bleiben als Rohwert stehen. */
const formatConnectors = (connectors) => {
  const parts = (Array.isArray(connectors) ? connectors : [])
    .filter((connector) => typeof connector?.standard === "string")
    .map((connector) => {
      const label = CONNECTOR_LABELS[connector.standard] ?? connector.standard;
      const kw = toKw(connector.max_electric_power);
      return kw ? `${label} ${kw}kW` : label;
    });
  return parts.length ? [...new Set(parts)].join(" | ").slice(0, 120) : null;
};

// /v1/locations liefert evses direkt, OCPI 3.0 verschachtelt sie in charging_pool.
const collectEvses = (item) => [
  ...(Array.isArray(item.evses) ? item.evses : []),
  ...(Array.isArray(item.charging_pool)
    ? item.charging_pool.flatMap((pool) =>
        Array.isArray(pool?.evses) ? pool.evses : [],
      )
    : []),
];

/** Ein OCPDB-Standort -> { location, evses, skippedEvses } oder { error }. */
const mapLocation = (item, seenAt) => {
  if (!item || typeof item !== "object") return { error: "kein Objekt" };
  const locationId = toId(item.id);
  if (!locationId) return { error: "ungültige id" };

  const sourceUid = text(item.source, 64);
  const originalId = text(item.original_id, 128);
  if (!sourceUid || !originalId)
    return { error: "source oder original_id fehlt" };

  const lat = toCoordinate(item.coordinates?.lat ?? item.coordinates?.latitude);
  const lon = toCoordinate(
    item.coordinates?.lon ?? item.coordinates?.longitude,
  );
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return { error: "ungültige Koordinaten" };
  }

  const evses = [];
  let skippedEvses = 0;
  let maxPowerKw = null;
  for (const evse of collectEvses(item)) {
    const evseUid = toId(evse?.uid);
    if (!evseUid) {
      skippedEvses += 1;
      continue;
    }
    for (const connector of Array.isArray(evse.connectors)
      ? evse.connectors
      : []) {
      const kw = toKw(connector?.max_electric_power);
      if (kw && (maxPowerKw === null || kw > maxPowerKw)) maxPowerKw = kw;
    }
    evses.push({
      evse_uid: evseUid,
      location_id: locationId,
      connectors: formatConnectors(evse.connectors),
      status: normalizeStatus(evse.status),
      status_changed_at:
        toDate(evse.status_last_updated) ?? toDate(evse.last_updated),
      last_seen_at: seenAt,
      is_active: true,
    });
  }

  const roundedLat = Number(lat.toFixed(6));
  const roundedLon = Number(lon.toFixed(6));
  return {
    location: {
      location_id: locationId,
      source_uid: sourceUid,
      original_id: originalId,
      operator_name_raw: text(item.operator?.name, 160),
      address: text(item.address, 200),
      city: text(item.city, 100),
      lat: roundedLat,
      lon: roundedLon,
      geom: db.Location.point(roundedLat, roundedLon),
      max_power_kw: maxPowerKw,
      last_seen_at: seenAt,
      is_active: true,
    },
    evses,
    skippedEvses,
  };
};

// ─── HTTP ───────────────────────────────────────────────────────

const backoffMs = (attempt) =>
  Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS);

/** Retry-After in ms (Sekunden oder HTTP-Datum), null wenn nicht gesetzt. */
const retryAfterMs = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const until = Date.parse(String(value));
  return Number.isNaN(until) ? null : Math.max(until - Date.now(), 0);
};

/** Reiht die Abrufe aller Jobs nacheinander ein, damit der Mindestabstand auch bei parallelen Jobs gilt. */
function waitForRequestSlot(minIntervalMs) {
  const slot = throttle.queue.then(async () => {
    const wait = throttle.lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await clock.sleep(wait);
    throttle.lastRequestAt = Date.now();
  });
  throttle.queue = slot.catch(() => {});
  return slot;
}

const pausedMessage = () =>
  `OCPDB-Abrufe pausiert bis ${new Date(throttle.pausedUntil).toISOString()}`;

/** Pausiert alle weiteren Abrufe und liefert den Fehler für den laufenden Job. */
const pauseRequests = (ms, reason) => {
  throttle.pausedUntil = Math.max(throttle.pausedUntil, Date.now() + ms);
  return new Error(`${reason}; ${pausedMessage()}`);
};

/**
 * GET mit Mindestabstand; 429, 5xx und Netzwerkfehler mit wachsender Wartezeit wiederholen.
 * Verlangt der Server länger als RETRY_MAX_MS Pause oder scheitern alle Versuche,
 * fragt kein Job an, bis die Pause vorbei ist.
 */
async function fetchJson(url, params) {
  const { timeoutMs, minIntervalMs, userAgent } = apiSettings();

  for (let attempt = 1; ; attempt += 1) {
    if (Date.now() < throttle.pausedUntil) throw new Error(pausedMessage());
    await waitForRequestSlot(minIntervalMs);

    let res;
    try {
      res = await axios.get(url, {
        params,
        timeout: timeoutMs,
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        validateStatus: () => true,
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        throw pauseRequests(
          OUTAGE_PAUSE_MS,
          `OCPDB nicht erreichbar nach ${attempt} Versuchen: ${error.message}`,
        );
      }
      await clock.sleep(backoffMs(attempt));
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const requested = retryAfterMs(res.headers?.["retry-after"]);
      if (requested !== null && requested > RETRY_MAX_MS) {
        throw pauseRequests(
          requested,
          `OCPDB HTTP ${res.status} mit Retry-After ${Math.round(requested / 1000)} s`,
        );
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw pauseRequests(
          OUTAGE_PAUSE_MS,
          `OCPDB HTTP ${res.status} nach ${attempt} Versuchen`,
        );
      }
      await clock.sleep(requested ?? backoffMs(attempt));
      continue;
    }
    if (res.status !== 200) throw new Error(`OCPDB HTTP ${res.status}`);
    return res.data;
  }
}

/** Lädt alle Seiten (next_path, sonst next_offset) und übergibt jede sofort an onPage. */
async function fetchPages(path, params, onPage) {
  const { baseUrl, pageSize } = apiSettings();
  const origin = new URL(baseUrl).origin;
  const baseQuery = { ...params, limit: pageSize };
  const visited = new Set();

  let url = `${baseUrl}${path}`;
  let query = { ...baseQuery, offset: 0 };
  for (;;) {
    const key = `${url}|${JSON.stringify(query ?? {})}`;
    if (visited.has(key)) break;
    visited.add(key);

    const page = await fetchJson(url, query);
    if (!Array.isArray(page?.items))
      throw new Error("OCPDB-Antwort ohne items");
    if (page.items.length === 0) break;
    await onPage(page.items);

    if (page.next_path) {
      const next = new URL(page.next_path, origin);
      if (next.origin !== origin)
        throw new Error("next_path zeigt auf einen fremden Host");
      url = next.toString();
      query = undefined;
    } else if (Number.isInteger(page.next_offset) && page.next_offset > 0) {
      url = `${baseUrl}${path}`;
      query = { ...baseQuery, offset: page.next_offset };
    } else {
      break;
    }
  }
}

// ─── Schreiben ──────────────────────────────────────────────────

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
  return chunks;
};

const toApiTimestamp = (date) =>
  new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");

async function writeLocations(entries, { deactivateMissingEvses }) {
  await db.sequelize.transaction(async (transaction) => {
    await db.Location.bulkCreate(
      entries.map((entry) => entry.location),
      { updateOnDuplicate: LOCATION_UPDATE_FIELDS, transaction },
    );
    const evses = entries.flatMap((entry) => entry.evses);
    for (const evseChunk of chunk(evses, BATCH_SIZE)) {
      await db.Evse.bulkCreate(evseChunk, {
        updateOnDuplicate: EVSE_UPDATE_FIELDS,
        transaction,
      });
    }
    if (!deactivateMissingEvses) return;

    // EVSEs eines geänderten Standorts, die nicht mehr geliefert werden.
    const where = {
      location_id: {
        [Op.in]: entries.map((entry) => entry.location.location_id),
      },
      is_active: true,
    };
    if (evses.length)
      where.evse_uid = { [Op.notIn]: evses.map((evse) => evse.evse_uid) };
    await db.Evse.update({ is_active: false }, { where, transaction });
  });
}

/** Batch schreiben; schlägt er fehl, einzeln nachschreiben, damit ein kaputter Eintrag nicht den Lauf kippt. */
async function upsertBatch(entries, options, broken) {
  try {
    await writeLocations(entries, options);
    return entries.length;
  } catch (batchError) {
    let written = 0;
    for (const entry of entries) {
      try {
        await writeLocations([entry], options);
        written += 1;
      } catch (error) {
        broken.push(
          `${entry.location.location_id} (${error.message.slice(0, 80)})`,
        );
      }
    }
    // Nichts geschrieben = Problem mit der Datenbank, nicht mit den Daten.
    if (written === 0) throw batchError;
    return written;
  }
}

async function syncLocationPages(params, seenAt, options) {
  const stats = { items: 0, written: 0, skipped: 0, maxLastUpdated: null };
  const broken = [];

  await fetchPages(apiSettings().locationsPath, params, async (items) => {
    stats.items += items.length;
    const entries = [];
    for (const item of items) {
      const mapped = mapLocation(item, seenAt);
      if (mapped.error) {
        broken.push(`${text(item?.id, 40) ?? "?"} (${mapped.error})`);
        continue;
      }
      stats.skipped += mapped.skippedEvses;
      stats.maxLastUpdated = later(
        stats.maxLastUpdated,
        toDate(item.last_updated),
      );
      entries.push(mapped);
    }
    for (const batch of chunk(entries, BATCH_SIZE)) {
      stats.written += await upsertBatch(batch, options, broken);
    }
  });

  stats.skipped += broken.length;
  if (broken.length) {
    logger(
      "warn",
      `[ocpdbSync] ${broken.length} Standorte übersprungen: ${broken.slice(0, MAX_BROKEN_IN_LOG).join(", ")}`,
    );
  }
  return stats;
}

async function runProcedures({ polygon, showUnknown }) {
  await db.sequelize.query("CALL refresh_status(NULL)");
  await db.sequelize.query("CALL assign_operators()");
  await db.sequelize.query("CALL mark_duplicates(:meter)", {
    replacements: { meter: DUPLICATE_RADIUS_M },
  });
  await db.sequelize.query("CALL recompute_scope(:polygon, :showUnknown)", {
    replacements: { polygon, showUnknown },
  });
}

// ─── Jobs ───────────────────────────────────────────────────────

/**
 * Führt einen Job unter GET_LOCK aus und schreibt das Ergebnis in SyncStates.
 * GET_LOCK gilt pro Verbindung; die leere Transaktion hält dieselbe Verbindung bis RELEASE_LOCK.
 * Den Cursor gibt es nur bei Erfolg.
 */
async function runJob(job, work) {
  return db.sequelize.transaction(async (lockTransaction) => {
    const lock = {
      replacements: { name: LOCKS[job] },
      type: QueryTypes.SELECT,
      transaction: lockTransaction,
    };
    const [row] = await db.sequelize.query(
      "SELECT GET_LOCK(:name, 0) AS acquired",
      lock,
    );
    if (Number(row?.acquired) !== 1) return { skipped: true };

    try {
      const state = await db.SyncState.findByPk(job, { raw: true });
      const result = await work(state);
      await db.SyncState.upsert({
        job,
        last_run_at: new Date(),
        last_status: "OK",
        rows_changed: result.rows ?? 0,
        message: result.message?.slice(0, 255) ?? null,
        ...(result.cursor ? { cursor_ts: result.cursor } : {}),
      });
      return result;
    } catch (error) {
      logger("warn", `[ocpdbSync] ${job} fehlgeschlagen: ${error.message}`);
      await db.SyncState.upsert({
        job,
        last_run_at: new Date(),
        last_status: "ERROR",
        message: error.message.slice(0, 255),
      }).catch((stateError) =>
        logger("warn", `[ocpdbSync] SyncState: ${stateError.message}`),
      );
      throw error;
    } finally {
      await db.sequelize.query("SELECT RELEASE_LOCK(:name)", lock);
    }
  });
}

/** Alle Standorte laden; verschwundene nur nach vollständigem Lauf deaktivieren. */
const runLocationFull = () =>
  runJob("location_full", async () => {
    const scope = scopeSettings();
    const startedAt = new Date();
    const stats = await syncLocationPages({}, startedAt, {
      deactivateMissingEvses: false,
    });

    // Vollständig = alle Seiten ohne Fehler geladen. Vor den Prozeduren, damit in_scope stimmt.
    let deactivated = 0;
    if (stats.items > 0) {
      const where = { is_active: true, last_seen_at: { [Op.lt]: startedAt } };
      const [locations] = await db.Location.update(
        { is_active: false },
        { where },
      );
      const [evses] = await db.Evse.update({ is_active: false }, { where });
      deactivated = locations + evses;
    }
    await runProcedures(scope);

    // Erster Lauf: Deltas starten ab T0.
    await db.SyncState.update(
      { cursor_ts: startedAt },
      { where: { job: ["evse_delta", "location_delta"], cursor_ts: null } },
    );

    const message = `${stats.written} Standorte, ${stats.skipped} übersprungen, ${deactivated} deaktiviert`;
    logger("info", `[ocpdbSync] location_full: ${message}`);
    return {
      cursor: startedAt,
      rows: stats.written + deactivated,
      message,
      ...stats,
    };
  });

/** Status bekannter EVSEs aktualisieren; unbekannte uids nur zählen. */
const runEvseDelta = () =>
  runJob("evse_delta", async (state) => {
    if (!state?.cursor_ts)
      return { message: "Wartet auf die Erstladung (kein Cursor)." };

    const seenAt = new Date();
    const stats = { updated: 0, unknown: 0, skipped: 0 };
    const locationIds = new Set();
    let maxLastUpdated = null;

    const params = {
      last_updated_since: toApiTimestamp(state.cursor_ts),
      exclude_source_uids: EVSE_DELTA_EXCLUDED_SOURCES,
      sorted_by: "last_updated",
    };
    await fetchPages(apiSettings().evsesPath, params, async (items) => {
      const updates = new Map();
      for (const item of items) {
        const evseUid = toId(item?.uid);
        if (!evseUid) {
          stats.skipped += 1;
          continue;
        }
        const lastUpdated = toDate(item.last_updated);
        maxLastUpdated = later(maxLastUpdated, lastUpdated);
        updates.set(evseUid, {
          evse_uid: evseUid,
          status: normalizeStatus(item.status),
          status_changed_at: toDate(item.status_last_updated) ?? lastUpdated,
          last_seen_at: seenAt,
        });
      }
      if (!updates.size) return;

      const known = await db.Evse.findAll({
        attributes: ["evse_uid", "location_id"],
        where: { evse_uid: { [Op.in]: [...updates.keys()] } },
        raw: true,
      });
      const rows = [];
      for (const evse of known) {
        const update = updates.get(String(evse.evse_uid));
        if (!update) continue;
        rows.push({ ...update, location_id: evse.location_id });
        locationIds.add(String(evse.location_id));
      }
      stats.unknown += updates.size - rows.length;

      // Nur bekannte uids -> ON DUPLICATE KEY greift immer, es entsteht keine neue Zeile.
      if (rows.length) {
        await db.Evse.bulkCreate(rows, {
          updateOnDuplicate: EVSE_STATUS_FIELDS,
        });
        stats.updated += rows.length;
      }
    });

    for (const locationId of locationIds) {
      await db.sequelize.query("CALL refresh_status(:locationId)", {
        replacements: { locationId },
      });
    }

    if (stats.skipped)
      logger(
        "warn",
        `[ocpdbSync] evse_delta: ${stats.skipped} EVSEs ohne gültige uid`,
      );
    return {
      cursor: maxLastUpdated
        ? new Date(maxLastUpdated.getTime() - CURSOR_REWIND_MS)
        : null,
      rows: stats.updated,
      message: `${stats.updated} aktualisiert, ${stats.unknown} unbekannt, ${stats.skipped} übersprungen, ${locationIds.size} Standorte`,
      ...stats,
    };
  });

/** Geänderte Standorte nachladen und deren verschwundene EVSEs deaktivieren. */
const runLocationDelta = () =>
  runJob("location_delta", async (state) => {
    if (!state?.cursor_ts)
      return { message: "Wartet auf die Erstladung (kein Cursor)." };

    const scope = scopeSettings();
    const params = { last_updated_since: toApiTimestamp(state.cursor_ts) };
    const stats = await syncLocationPages(params, new Date(), {
      deactivateMissingEvses: true,
    });
    // refresh_status zusätzlich, damit neue/deaktivierte EVSEs in state und mark_duplicates zählen.
    await runProcedures(scope);

    const message = `${stats.written} Standorte, ${stats.skipped} übersprungen`;
    if (stats.items) logger("info", `[ocpdbSync] location_delta: ${message}`);
    return {
      cursor: stats.maxLastUpdated
        ? new Date(stats.maxLastUpdated.getTime() - CURSOR_REWIND_MS)
        : null,
      rows: stats.written,
      message,
      ...stats,
    };
  });

module.exports = {
  runLocationFull,
  runEvseDelta,
  runLocationDelta,
  // Nur für Tests exportiert
  _internals: {
    clock,
    throttle,
    mapLocation,
    formatConnectors,
    toKw,
    normalizeStatus,
    fetchPages,
  },
};
