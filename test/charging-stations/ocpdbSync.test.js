"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { calls: logCalls, patch } = require("../helpers/stubSideEffects");
const axios = require("axios");
const db = require("../../models");
const {
  runLocationFull,
  runEvseDelta,
  runLocationDelta,
  _internals,
} = require("../../services/charging-stations/ocpdbSync");
const fixtures = require("./fixtures/ocpdb-responses.json");

const { Op } = db.Sequelize;

// Feste Werte, unabhängig von der lokalen .env.
Object.assign(process.env, {
  OCPDB_BASE_URL: "https://api.mobidata-bw.de/ocpdb",
  OCPDB_LOCATIONS_PATH: "/api/public/v1/locations",
  OCPDB_EVSES_PATH: "/api/public/ocpi/3.0/evses",
  OCPDB_PAGE_SIZE: "1000",
  OCPDB_USER_AGENT: "GrueneFlotte-Test/1.0 (+https://gruene-flotte.com)",
  CHARGING_FREIBURG_POLYGON_WKT:
    "POLYGON((7.7 47.9, 7.9 47.9, 7.9 48.1, 7.7 48.1, 7.7 47.9))",
  CHARGING_SHOW_UNKNOWN: "0",
});

const LOCATIONS_URL =
  "https://api.mobidata-bw.de/ocpdb/api/public/v1/locations";
const EVSES_URL = "https://api.mobidata-bw.de/ocpdb/api/public/ocpi/3.0/evses";
const SEEN_AT = new Date("2026-11-18T08:00:00Z");

const copy = (value) => JSON.parse(JSON.stringify(value));
const ok = (data) => ({ status: 200, data: copy(data), headers: {} });
const status = (code, headers = {}) => ({ status: code, data: {}, headers });
const locationPages = () => [
  ok(fixtures.locationsPage1),
  ok(fixtures.locationsPage2),
  ok(fixtures.locationsPage3),
];

/** Wartezeiten aufzeichnen statt echt zu schlafen. */
function mockClock(t) {
  const sleeps = [];
  t.after(patch(_internals.clock, { sleep: async (ms) => sleeps.push(ms) }));
  t.after(patch(_internals.throttle, { lastRequestAt: 0, pausedUntil: 0 }));
  return sleeps;
}

/** axios.get liefert die Antworten der Reihe nach; Error-Objekte werden geworfen. */
function mockHttp(t, responses) {
  const requests = [];
  t.after(
    patch(axios, {
      get: async (url, config) => {
        requests.push({
          url,
          params: config?.params,
          headers: config?.headers,
        });
        const next = responses.shift();
        if (!next) throw new Error("unerwarteter Abruf");
        if (next instanceof Error) throw next;
        return next;
      },
    }),
  );
  return requests;
}

/** Ersetzt alle DB-Zugriffe und protokolliert sie in einer Reihenfolge. */
function mockDb(
  t,
  { syncState = null, knownEvses = [], lockAcquired = 1 } = {},
) {
  const log = [];
  const record = (name, payload) => {
    log.push({ name, ...payload });
  };
  t.after(
    patch(db.sequelize, {
      transaction: async (fn) => fn({ id: "tx" }),
      query: async (sql, options) => {
        record("query", { sql, replacements: options?.replacements });
        return /GET_LOCK/.test(sql) ? [{ acquired: lockAcquired }] : [];
      },
    }),
  );
  t.after(
    patch(db.Location, {
      bulkCreate: async (rows, options) =>
        record("Location.bulkCreate", { rows, options }),
      update: async (values, options) => {
        record("Location.update", { values, options });
        return [2];
      },
    }),
  );
  t.after(
    patch(db.Evse, {
      bulkCreate: async (rows, options) =>
        record("Evse.bulkCreate", { rows, options }),
      update: async (values, options) => {
        record("Evse.update", { values, options });
        return [1];
      },
      findAll: async (options) => {
        record("Evse.findAll", { options });
        return knownEvses;
      },
    }),
  );
  t.after(
    patch(db.SyncState, {
      findByPk: async () => syncState,
      upsert: async (values) => record("SyncState.upsert", { values }),
      update: async (values, options) =>
        record("SyncState.update", { values, options }),
    }),
  );
  const of = (name) => log.filter((entry) => entry.name === name);
  const calls = () =>
    of("query").filter((entry) => entry.sql.startsWith("CALL"));
  return { log, of, calls };
}

// ─── Mapping ────────────────────────────────────────────────────

test("toKw converts watts to kW with one decimal", () => {
  assert.equal(_internals.toKw(150000), 150);
  assert.equal(_internals.toKw(3700), 3.7);
  assert.equal(_internals.toKw(0), null);
  assert.equal(_internals.toKw(undefined), null);
  assert.equal(_internals.toKw("abc"), null);
});

test("formatConnectors maps standards and joins with pipes", () => {
  assert.equal(
    _internals.formatConnectors([
      { standard: "IEC_62196_T2_COMBO", max_electric_power: 150000 },
      { standard: "IEC_62196_T2", max_electric_power: 22000 },
    ]),
    "CCS 150kW | Typ2 22kW",
  );
  assert.equal(
    _internals.formatConnectors([
      { standard: "CHADEMO", max_electric_power: 50000 },
    ]),
    "CHADEMO 50kW",
  );
  assert.equal(
    _internals.formatConnectors([{ standard: "DOMESTIC_F" }]),
    "DOMESTIC_F",
  );
  assert.equal(_internals.formatConnectors([]), null);
  assert.equal(_internals.formatConnectors("kaputt"), null);
  const many = Array.from({ length: 30 }, (_, i) => ({
    standard: `STANDARD_${i}`,
    max_electric_power: 22000,
  }));
  assert.ok(_internals.formatConnectors(many).length <= 120);
});

test("normalizeStatus maps unknown values to UNKNOWN", () => {
  assert.equal(_internals.normalizeStatus("AVAILABLE"), "AVAILABLE");
  assert.equal(_internals.normalizeStatus("STATIC"), "STATIC");
  assert.equal(_internals.normalizeStatus("SOMETHING_NEW"), "UNKNOWN");
  assert.equal(_internals.normalizeStatus(undefined), "UNKNOWN");
  assert.equal(_internals.normalizeStatus(["AVAILABLE"]), "UNKNOWN");
});

test("mapLocation maps a live location with power in kW and connector text", () => {
  const { location, evses, skippedEvses } = _internals.mapLocation(
    fixtures.locationsPage1.items[0],
    SEEN_AT,
  );
  assert.deepEqual(location, {
    location_id: "123",
    source_uid: "datex2_enbw",
    original_id: "ENBW-FR-1",
    operator_name_raw: "ENBW",
    address: "Bertoldstraße 1",
    city: "Freiburg",
    lat: 47.995901,
    lon: 7.852201,
    geom: { type: "Point", coordinates: [7.852201, 47.995901] },
    max_power_kw: 150,
    last_seen_at: SEEN_AT,
    is_active: true,
  });
  assert.equal(skippedEvses, 0);
  assert.deepEqual(evses[0], {
    evse_uid: "262347501",
    location_id: "123",
    connectors: "CCS 150kW | Typ2 22kW",
    status: "AVAILABLE",
    status_changed_at: new Date("2026-11-18T07:26:56Z"),
    last_seen_at: SEEN_AT,
    is_active: true,
  });
  assert.equal(evses[1].connectors, "CHADEMO 50kW");
  assert.equal(evses[1].status, "CHARGING");
});

test("mapLocation keeps STATIC for BNetzA and reads latitude/longitude", () => {
  const { location, evses } = _internals.mapLocation(
    fixtures.locationsPage1.items[1],
    SEEN_AT,
  );
  assert.equal(location.lat, 51.608953);
  assert.equal(location.lon, 7.522998);
  assert.equal(location.max_power_kw, 11);
  assert.equal(evses[0].status, "STATIC");
  assert.deepEqual(
    evses[0].status_changed_at,
    new Date("2026-11-10T18:06:33Z"),
  );
});

test("mapLocation reads charging_pool, missing operator and unknown status", () => {
  const { location, evses } = _internals.mapLocation(
    fixtures.locationsPage2.items[0],
    SEEN_AT,
  );
  assert.equal(location.operator_name_raw, null);
  assert.equal(location.max_power_kw, 3.7);
  assert.equal(evses.length, 1);
  assert.equal(evses[0].status, "UNKNOWN");
  assert.equal(evses[0].connectors, "Typ2 3.7kW");
});

test("mapLocation rejects broken items instead of throwing", () => {
  const valid = fixtures.locationsPage1.items[0];
  assert.ok(
    _internals.mapLocation(fixtures.locationsPage1.items[2], SEEN_AT).error,
  );
  assert.ok(
    _internals.mapLocation(fixtures.locationsPage2.items[1], SEEN_AT).error,
  );
  assert.ok(_internals.mapLocation(null, SEEN_AT).error);
  assert.ok(
    _internals.mapLocation({ ...valid, id: { $gt: 0 } }, SEEN_AT).error,
  );
  assert.ok(_internals.mapLocation({ ...valid, id: ["123"] }, SEEN_AT).error);
  assert.ok(
    _internals.mapLocation({ ...valid, id: "1; DROP TABLE" }, SEEN_AT).error,
  );
  assert.ok(
    _internals.mapLocation({ ...valid, source: undefined }, SEEN_AT).error,
  );
  assert.ok(
    _internals.mapLocation(
      { ...valid, coordinates: { lat: 95, lon: 7 } },
      SEEN_AT,
    ).error,
  );
  assert.ok(
    _internals.mapLocation(
      { ...valid, coordinates: { lat: null, lon: 7 } },
      SEEN_AT,
    ).error,
  );

  const withBrokenEvse = {
    ...valid,
    evses: [...valid.evses, { uid: "kaputt" }],
  };
  const mapped = _internals.mapLocation(withBrokenEvse, SEEN_AT);
  assert.equal(mapped.evses.length, 2);
  assert.equal(mapped.skippedEvses, 1);
});

// ─── HTTP ───────────────────────────────────────────────────────

test("fetchPages follows next_path, then next_offset, and stops on an empty page", async (t) => {
  mockClock(t);
  const requests = mockHttp(t, locationPages());
  const pages = [];

  await _internals.fetchPages(
    "/api/public/v1/locations",
    { last_updated_since: "x" },
    async (items) => {
      pages.push(items.map((item) => item.id));
    },
  );

  assert.deepEqual(pages, [
    ["123", "72555", "999"],
    ["456", "x-1"],
  ]);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, LOCATIONS_URL);
  assert.deepEqual(requests[0].params, {
    last_updated_since: "x",
    limit: 1000,
    offset: 0,
  });
  assert.equal(requests[1].url, `${LOCATIONS_URL}?limit=1000&offset=3`);
  assert.equal(requests[1].params, undefined);
  assert.equal(requests[2].url, LOCATIONS_URL);
  assert.deepEqual(requests[2].params, {
    last_updated_since: "x",
    limit: 1000,
    offset: 5,
  });
  assert.match(requests[0].headers["User-Agent"], /^GrueneFlotte-Test\/1\.0/);
});

test("fetchPages refuses a next_path on a foreign host", async (t) => {
  mockClock(t);
  mockHttp(t, [
    ok({ ...fixtures.locationsPage1, next_path: "https://evil.example/steal" }),
  ]);
  await assert.rejects(
    _internals.fetchPages("/api/public/v1/locations", {}, async () => {}),
    /fremden Host/,
  );
});

test("fetchJson retries 429 and 5xx with growing waits and honours Retry-After", async (t) => {
  const sleeps = mockClock(t);
  const requests = mockHttp(t, [
    status(429),
    status(503),
    status(429, { "retry-after": "7" }),
    new Error("ECONNRESET"),
    ok(fixtures.locationsPage3),
  ]);

  await _internals.fetchPages("/api/public/v1/locations", {}, async () => {});

  assert.equal(requests.length, 5);
  // Mindestabstand (<= 1 s) herausfiltern, übrig bleibt der Backoff.
  assert.deepEqual(
    sleeps.filter((ms) => ms > 1000),
    [2000, 4000, 7000, 16000],
  );
});

test("fetchJson gives up after five failed attempts", async (t) => {
  mockClock(t);
  const requests = mockHttp(
    t,
    Array.from({ length: 5 }, () => status(502)),
  );
  await assert.rejects(
    _internals.fetchPages("/api/public/v1/locations", {}, async () => {}),
    /HTTP 502 nach 5 Versuchen/,
  );
  assert.equal(requests.length, 5);
});

test("fetchJson pauses all requests after five failed attempts", async (t) => {
  mockClock(t);
  const requests = mockHttp(
    t,
    Array.from({ length: 5 }, () => new Error("ECONNREFUSED")),
  );
  await assert.rejects(
    _internals.fetchPages("/api/public/v1/locations", {}, async () => {}),
    /nicht erreichbar nach 5 Versuchen.*pausiert bis/,
  );
  await assert.rejects(
    _internals.fetchPages("/api/public/ocpi/3.0/evses", {}, async () => {}),
    /pausiert bis/,
  );
  assert.equal(requests.length, 5);
});

test("fetchJson does not retry early when Retry-After exceeds the backoff cap", async (t) => {
  const sleeps = mockClock(t);
  const requests = mockHttp(t, [status(429, { "retry-after": "600" })]);
  await assert.rejects(
    _internals.fetchPages("/api/public/v1/locations", {}, async () => {}),
    /Retry-After 600 s/,
  );
  assert.equal(requests.length, 1);
  assert.deepEqual(sleeps, []);
  assert.ok(_internals.throttle.pausedUntil - Date.now() > 590_000);
});

test("parallel jobs share the minimum interval between requests", async (t) => {
  // Virtuelle Uhr: sleep rückt die Zeit vor und gibt erst im nächsten Macrotask frei.
  const realNow = Date.now;
  let offset = 0;
  t.after(patch(Date, { now: () => realNow() + offset }));
  t.after(
    patch(_internals.clock, {
      sleep: (ms) => {
        offset += ms;
        return new Promise((resolve) => setImmediate(resolve));
      },
    }),
  );
  t.after(
    patch(_internals.throttle, { lastRequestAt: Date.now(), pausedUntil: 0 }),
  );
  const times = [];
  t.after(
    patch(axios, {
      get: async () => {
        times.push(Date.now());
        return ok(fixtures.locationsPage3);
      },
    }),
  );

  await Promise.all([
    _internals.fetchPages("/api/public/v1/locations", {}, async () => {}),
    _internals.fetchPages("/api/public/ocpi/3.0/evses", {}, async () => {}),
  ]);

  assert.equal(times.length, 2);
  assert.ok(times[1] - times[0] >= 1000);
});

test("fetchJson does not retry other 4xx responses", async (t) => {
  mockClock(t);
  const requests = mockHttp(t, [status(404)]);
  await assert.rejects(
    _internals.fetchPages("/api/public/v1/locations", {}, async () => {}),
    /HTTP 404/,
  );
  assert.equal(requests.length, 1);
});

// ─── location_full ──────────────────────────────────────────────

test("runLocationFull upserts in batches, deactivates before the procedures and sets cursors", async (t) => {
  mockClock(t);
  mockHttp(t, locationPages());
  const dbMock = mockDb(t);

  const result = await runLocationFull();

  const locationWrites = dbMock.of("Location.bulkCreate");
  assert.deepEqual(
    locationWrites.map((write) => write.rows.map((row) => row.location_id)),
    [["123", "72555"], ["456"]],
  );
  const updateFields = locationWrites[0].options.updateOnDuplicate;
  for (const field of [
    "operator_id",
    "state",
    "evse_total",
    "evse_available",
    "enbw_plus",
    "in_scope",
    "canonical_location_id",
  ]) {
    assert.ok(
      !updateFields.includes(field),
      `${field} darf der Sync nicht setzen`,
    );
  }
  assert.equal(locationWrites[0].options.transaction.id, "tx");
  assert.deepEqual(
    dbMock
      .of("Evse.bulkCreate")
      .flatMap((write) => write.rows.map((row) => row.evse_uid)),
    ["262347501", "262347502", "259994189", "262346087"],
  );

  // Vollständiger Lauf: Deaktivierung mit last_seen_at < T0, danach die Prozeduren.
  const locationUpdate = dbMock.of("Location.update")[0];
  assert.deepEqual(locationUpdate.values, { is_active: false });
  assert.ok(locationUpdate.options.where.last_seen_at[Op.lt] instanceof Date);
  assert.equal(dbMock.of("Evse.update").length, 1);
  const firstCall = dbMock.log.findIndex((entry) =>
    entry.sql?.startsWith("CALL"),
  );
  assert.ok(dbMock.log.indexOf(locationUpdate) < firstCall);
  assert.deepEqual(
    dbMock.calls().map((entry) => entry.sql),
    [
      "CALL refresh_status(NULL)",
      "CALL assign_operators()",
      "CALL mark_duplicates(:meter)",
      "CALL recompute_scope(:polygon, :showUnknown)",
    ],
  );
  assert.deepEqual(dbMock.calls()[3].replacements, {
    polygon: process.env.CHARGING_FREIBURG_POLYGON_WKT,
    showUnknown: 0,
  });

  const cursorInit = dbMock.of("SyncState.update")[0];
  assert.deepEqual(cursorInit.options.where, {
    job: ["evse_delta", "location_delta"],
    cursor_ts: null,
  });
  const state = dbMock.of("SyncState.upsert")[0].values;
  assert.equal(state.job, "location_full");
  assert.equal(state.last_status, "OK");
  assert.ok(state.cursor_ts instanceof Date);
  assert.equal(result.skipped, 2);
  assert.ok(
    dbMock.of("query").some((entry) => entry.sql.includes("RELEASE_LOCK")),
  );
  assert.ok(
    logCalls.logger.some(
      (entry) => entry.type === "warn" && entry.message.includes("x-1"),
    ),
  );
});

test("runLocationFull does not deactivate or move the cursor when a page fails", async (t) => {
  mockClock(t);
  mockHttp(t, [
    ok(fixtures.locationsPage1),
    ...Array.from({ length: 5 }, () => status(500)),
  ]);
  const dbMock = mockDb(t);

  await assert.rejects(runLocationFull(), /HTTP 500/);

  assert.equal(dbMock.of("Location.bulkCreate").length, 1);
  assert.equal(dbMock.of("Location.update").length, 0);
  assert.equal(dbMock.of("Evse.update").length, 0);
  assert.equal(dbMock.calls().length, 0);
  assert.equal(dbMock.of("SyncState.update").length, 0);
  const state = dbMock.of("SyncState.upsert")[0].values;
  assert.equal(state.last_status, "ERROR");
  assert.match(state.message, /HTTP 500/);
  assert.ok(!("cursor_ts" in state));
  assert.ok(
    dbMock.of("query").some((entry) => entry.sql.includes("RELEASE_LOCK")),
  );
});

test("runLocationFull skips deactivation when the API returns no locations", async (t) => {
  mockClock(t);
  mockHttp(t, [ok(fixtures.locationsPage3)]);
  const dbMock = mockDb(t);

  await runLocationFull();

  assert.equal(dbMock.of("Location.update").length, 0);
  assert.equal(dbMock.of("Evse.update").length, 0);
});

test("runLocationFull fails early on an invalid polygon", async (t) => {
  t.after(() => {
    process.env.CHARGING_FREIBURG_POLYGON_WKT =
      "POLYGON((7.7 47.9, 7.9 47.9, 7.9 48.1, 7.7 48.1, 7.7 47.9))";
  });
  process.env.CHARGING_FREIBURG_POLYGON_WKT = "POINT(7 48)";
  mockClock(t);
  const requests = mockHttp(t, []);
  const dbMock = mockDb(t);

  await assert.rejects(runLocationFull(), /POLYGON/);
  assert.equal(requests.length, 0);
  assert.equal(dbMock.of("SyncState.upsert")[0].values.last_status, "ERROR");
});

test("a job is skipped while another instance holds the lock", async (t) => {
  mockClock(t);
  const requests = mockHttp(t, []);
  const dbMock = mockDb(t, { lockAcquired: 0 });

  const result = await runLocationFull();

  assert.deepEqual(result, { skipped: true });
  assert.equal(requests.length, 0);
  assert.equal(dbMock.of("SyncState.upsert").length, 0);
});

// ─── evse_delta ─────────────────────────────────────────────────

test("runEvseDelta updates known EVSEs, counts unknown uids and rewinds the cursor by 2 minutes", async (t) => {
  mockClock(t);
  const requests = mockHttp(t, [ok(fixtures.evseDelta)]);
  const dbMock = mockDb(t, {
    syncState: {
      job: "evse_delta",
      cursor_ts: new Date("2026-11-18T07:20:00.500Z"),
    },
    knownEvses: [
      { evse_uid: 262346087, location_id: 456 },
      { evse_uid: "262347501", location_id: "123" },
    ],
  });

  const result = await runEvseDelta();

  assert.equal(requests[0].url, EVSES_URL);
  assert.deepEqual(requests[0].params, {
    last_updated_since: "2026-11-18T07:20:00Z",
    exclude_source_uids: "bnetza_api,bnetza_excel",
    sorted_by: "last_updated",
    limit: 1000,
    offset: 0,
  });

  const lookup = dbMock.of("Evse.findAll")[0].options;
  assert.deepEqual(lookup.where.evse_uid[Op.in], [
    "262346087",
    "262347501",
    "777000111",
  ]);

  const write = dbMock.of("Evse.bulkCreate")[0];
  assert.deepEqual(write.options.updateOnDuplicate, [
    "status",
    "status_changed_at",
    "last_seen_at",
  ]);
  assert.deepEqual(
    write.rows.map((row) => [row.evse_uid, row.location_id, row.status]),
    [
      ["262346087", 456, "CHARGING"],
      ["262347501", "123", "OUTOFORDER"],
    ],
  );
  assert.ok(!write.rows.some((row) => row.evse_uid === "777000111"));
  assert.deepEqual(
    write.rows[1].status_changed_at,
    new Date("2026-11-18T07:29:00Z"),
  );

  assert.deepEqual(
    dbMock.calls().map((entry) => entry.replacements),
    [{ locationId: "456" }, { locationId: "123" }],
  );
  assert.equal(result.updated, 2);
  assert.equal(result.unknown, 1);
  assert.equal(result.skipped, 1);

  const state = dbMock.of("SyncState.upsert")[0].values;
  assert.equal(state.last_status, "OK");
  assert.equal(state.rows_changed, 2);
  assert.deepEqual(state.cursor_ts, new Date("2026-11-18T07:28:00Z"));
});

test("runEvseDelta keeps the cursor when the API fails", async (t) => {
  mockClock(t);
  mockHttp(
    t,
    Array.from({ length: 5 }, () => status(429)),
  );
  const dbMock = mockDb(t, {
    syncState: {
      job: "evse_delta",
      cursor_ts: new Date("2026-11-18T07:20:00Z"),
    },
  });

  await assert.rejects(runEvseDelta(), /HTTP 429/);

  const state = dbMock.of("SyncState.upsert")[0].values;
  assert.equal(state.last_status, "ERROR");
  assert.ok(!("cursor_ts" in state));
  assert.equal(dbMock.of("Evse.bulkCreate").length, 0);
});

test("runEvseDelta waits for the initial load when there is no cursor", async (t) => {
  mockClock(t);
  const requests = mockHttp(t, []);
  const dbMock = mockDb(t, {
    syncState: { job: "evse_delta", cursor_ts: null },
  });

  await runEvseDelta();

  assert.equal(requests.length, 0);
  const state = dbMock.of("SyncState.upsert")[0].values;
  assert.match(state.message, /Erstladung/);
  assert.ok(!("cursor_ts" in state));
});

test("runEvseDelta leaves the cursor unchanged when nothing changed", async (t) => {
  mockClock(t);
  mockHttp(t, [ok(fixtures.locationsPage3)]);
  const dbMock = mockDb(t, {
    syncState: {
      job: "evse_delta",
      cursor_ts: new Date("2026-11-18T07:20:00Z"),
    },
  });

  await runEvseDelta();

  assert.ok(!("cursor_ts" in dbMock.of("SyncState.upsert")[0].values));
});

// ─── location_delta ─────────────────────────────────────────────

test("runLocationDelta deactivates EVSEs that vanished from changed locations", async (t) => {
  mockClock(t);
  const requests = mockHttp(t, locationPages());
  const dbMock = mockDb(t, {
    syncState: {
      job: "location_delta",
      cursor_ts: new Date("2026-11-18T07:00:00Z"),
    },
  });

  await runLocationDelta();

  assert.deepEqual(requests[0].params, {
    last_updated_since: "2026-11-18T07:00:00Z",
    limit: 1000,
    offset: 0,
  });
  const [first, second] = dbMock.of("Evse.update");
  assert.deepEqual(first.values, { is_active: false });
  assert.deepEqual(first.options.where.location_id[Op.in], ["123", "72555"]);
  assert.deepEqual(first.options.where.evse_uid[Op.notIn], [
    "262347501",
    "262347502",
    "259994189",
  ]);
  assert.equal(first.options.transaction.id, "tx");
  assert.deepEqual(second.options.where.location_id[Op.in], ["456"]);

  // Standorte selbst werden im Delta nie deaktiviert.
  assert.equal(dbMock.of("Location.update").length, 0);
  assert.deepEqual(
    dbMock.calls().map((entry) => entry.sql)[0],
    "CALL refresh_status(NULL)",
  );
  assert.deepEqual(
    dbMock.of("SyncState.upsert")[0].values.cursor_ts,
    new Date("2026-11-18T07:23:00Z"),
  );
});
