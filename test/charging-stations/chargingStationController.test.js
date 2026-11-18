"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createMockRes, patch } = require("../helpers/stubSideEffects");
const db = require("../../models");
const {
  getChargingStations,
  getChargingStation,
  getFreiburgArea,
  _internals,
} = require("../../controllers/charging-stations/chargingStationController");

const { Op } = db.Sequelize;

const BOUNDS = {
  fromLat: "47.9",
  toLat: "48.1",
  fromLon: "7.7",
  toLon: "7.95",
};

// So liefert Sequelize die Zeile: DECIMAL als String, BIGINT als Zahl.
const LOCATION_ROW = {
  location_id: 123,
  lat: "47.995901",
  lon: "7.852201",
  address: "Bertoldstraße 1",
  city: "Freiburg",
  operator_name_raw: "ENBW",
  operator: { name: "EnBW" },
  max_power_kw: "150.0",
  evse_total: 2,
  evse_available: 1,
  state: "FREE",
  enbw_plus: "YES",
};

// ─── Validierung ────────────────────────────────────────────────

test("parseBounds accepts a valid map section", () => {
  assert.deepEqual(_internals.parseBounds(BOUNDS), {
    bounds: { fromLat: 47.9, toLat: 48.1, fromLon: 7.7, toLon: 7.95 },
  });
  assert.deepEqual(
    _internals.parseBounds({
      fromLat: "-12.5",
      toLat: "-10",
      fromLon: "-8",
      toLon: "-7",
    }).bounds,
    { fromLat: -12.5, toLat: -10, fromLon: -8, toLon: -7 },
  );
});

test("parseBounds rejects missing, out-of-range, inverted and injected values", () => {
  assert.ok(_internals.parseBounds({}).error);
  assert.ok(_internals.parseBounds(undefined).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, toLat: undefined }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, toLat: "91" }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, toLon: "181" }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, fromLat: "48.2" }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, fromLon: "7.95" }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, fromLat: ["47.9"] }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, fromLat: { $gt: 0 } }).error);
  assert.ok(
    _internals.parseBounds({ ...BOUNDS, fromLat: "47.9), geom) OR 1=1 -- " })
      .error,
  );
  assert.ok(_internals.parseBounds({ ...BOUNDS, fromLat: "1e2" }).error);
  assert.ok(_internals.parseBounds({ ...BOUNDS, fromLat: "" }).error);
});

test("parseLocationId accepts digits only", () => {
  assert.equal(_internals.parseLocationId("72555"), "72555");
  assert.equal(_internals.parseLocationId("1; DROP TABLE"), null);
  assert.equal(_internals.parseLocationId(["1"]), null);
  assert.equal(_internals.parseLocationId("x"), null);
});

// ─── Liste ──────────────────────────────────────────────────────

test("getChargingStations returns in-scope stations of the map section", async (t) => {
  let options;
  t.after(
    patch(db.Location, {
      findAll: async (opts) => {
        options = opts;
        return [LOCATION_ROW];
      },
    }),
  );

  const res = createMockRes();
  await getChargingStations({ query: BOUNDS }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    {
      location_id: "123",
      lat: 47.995901,
      lon: 7.852201,
      address: "Bertoldstraße 1",
      city: "Freiburg",
      operator: "EnBW",
      max_power_kw: 150,
      evse_total: 2,
      evse_available: 1,
      state: "FREE",
      enbw_plus: "YES",
    },
  ]);
  assert.equal(options.where.in_scope, true);
  assert.equal(
    options.where[Op.and][0].val,
    "MBRContains(ST_GeomFromText('POLYGON((7.7 47.9, 7.95 47.9, 7.95 48.1, 7.7 48.1, 7.7 47.9))'), geom)",
  );
  assert.equal(options.limit, _internals.MAX_STATIONS);
  assert.ok(!options.attributes.includes("geom"));
  assert.ok(!options.attributes.includes("in_scope"));
});

test("getChargingStations falls back to the raw operator name", async (t) => {
  t.after(
    patch(db.Location, {
      findAll: async () => [
        { ...LOCATION_ROW, operator: null, max_power_kw: null },
      ],
    }),
  );
  const res = createMockRes();
  await getChargingStations({ query: BOUNDS }, res);
  assert.equal(res.body[0].operator, "ENBW");
  assert.equal(res.body[0].max_power_kw, null);
});

test("getChargingStations returns an empty array when nothing is in the section", async (t) => {
  t.after(patch(db.Location, { findAll: async () => [] }));
  const res = createMockRes();
  await getChargingStations({ query: BOUNDS }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("getChargingStations rejects invalid bounds without querying", async (t) => {
  let called = false;
  t.after(
    patch(db.Location, {
      findAll: async () => {
        called = true;
        return [];
      },
    }),
  );
  const res = createMockRes();
  await getChargingStations({ query: { fromLat: "abc" } }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
  assert.equal(called, false);
});

test("getChargingStations hides database errors", async (t) => {
  t.after(
    patch(db.Location, {
      findAll: async () => {
        throw new Error("ER_SECRET_DETAIL");
      },
    }),
  );
  const res = createMockRes();
  await getChargingStations({ query: BOUNDS }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Es ist ein Fehler aufgetreten" });
});

// ─── Detail ─────────────────────────────────────────────────────

test("getChargingStation returns the station with its active EVSEs", async (t) => {
  let options;
  t.after(
    patch(db.Location, {
      findOne: async (opts) => {
        options = opts;
        return {
          ...LOCATION_ROW,
          evses: [
            {
              evse_uid: 262347501,
              connectors: "CCS 150kW | Typ2 22kW",
              status: "AVAILABLE",
              status_changed_at: new Date("2026-11-18T07:26:56Z"),
            },
          ],
        };
      },
    }),
  );

  const res = createMockRes();
  await getChargingStation({ params: { id: "123" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, "FREE");
  assert.deepEqual(res.body.evses, [
    {
      evse_uid: "262347501",
      connectors: "CCS 150kW | Typ2 22kW",
      status: "AVAILABLE",
      status_changed_at: new Date("2026-11-18T07:26:56Z"),
    },
  ]);
  assert.deepEqual(options.where, { location_id: "123", in_scope: true });
  const evseInclude = options.include.find((include) => include.as === "evses");
  assert.deepEqual(evseInclude.where, { is_active: true });
  assert.equal(evseInclude.required, false);
});

test("getChargingStation returns 404 for unknown or hidden stations", async (t) => {
  t.after(patch(db.Location, { findOne: async () => null }));
  const res = createMockRes();
  await getChargingStation({ params: { id: "999" } }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Ladesäule nicht gefunden." });
});

test("getChargingStation rejects non-numeric ids", async () => {
  const res = createMockRes();
  await getChargingStation({ params: { id: "1 OR 1=1" } }, res);
  assert.equal(res.statusCode, 400);
});

// ─── Freiburg-Gebiet ────────────────────────────────────────────

test("parsePolygonWkt converts WKT rings to GeoJSON coordinates", () => {
  assert.deepEqual(
    _internals.parsePolygonWkt(
      "POLYGON((7.7 47.9, 7.9 47.9, 7.9 48.1, 7.7 47.9))",
    ),
    [
      [
        [7.7, 47.9],
        [7.9, 47.9],
        [7.9, 48.1],
        [7.7, 47.9],
      ],
    ],
  );
  const withHole = _internals.parsePolygonWkt(
    "POLYGON ((0 0, 10 0, 10 10, 0 0), (1 1, 2 1, 2 2, 1 1))",
  );
  assert.equal(withHole.length, 2);
});

test("parsePolygonWkt rejects broken WKT", () => {
  assert.equal(_internals.parsePolygonWkt(""), null);
  assert.equal(_internals.parsePolygonWkt("POINT(7 48)"), null);
  assert.equal(_internals.parsePolygonWkt("POLYGON((7 48, 8 48, 7 48))"), null);
  assert.equal(
    _internals.parsePolygonWkt("POLYGON((7 48, 8 48, 8 x, 7 48))"),
    null,
  );
  assert.equal(
    _internals.parsePolygonWkt("POLYGON((7 95, 8 48, 8 49, 7 95))"),
    null,
  );
  assert.equal(
    _internals.parsePolygonWkt("POLYGON((7 48 1, 8 48 1, 8 49 1, 7 48 1))"),
    null,
  );
});

test("getFreiburgArea returns the configured polygon as GeoJSON", async (t) => {
  const original = process.env.CHARGING_FREIBURG_POLYGON_WKT;
  t.after(() => {
    process.env.CHARGING_FREIBURG_POLYGON_WKT = original;
  });
  process.env.CHARGING_FREIBURG_POLYGON_WKT =
    "POLYGON((7.7 47.9, 7.9 47.9, 7.9 48.1, 7.7 47.9))";

  const res = createMockRes();
  await getFreiburgArea({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.type, "Feature");
  assert.equal(res.body.geometry.type, "Polygon");
  assert.deepEqual(res.body.geometry.coordinates[0][2], [7.9, 48.1]);
});

test("getFreiburgArea returns 404 without and 500 with a broken polygon", async (t) => {
  const original = process.env.CHARGING_FREIBURG_POLYGON_WKT;
  t.after(() => {
    process.env.CHARGING_FREIBURG_POLYGON_WKT = original;
  });

  process.env.CHARGING_FREIBURG_POLYGON_WKT = "";
  const missing = createMockRes();
  await getFreiburgArea({}, missing);
  assert.equal(missing.statusCode, 404);

  process.env.CHARGING_FREIBURG_POLYGON_WKT = "POLYGON((kaputt))";
  const broken = createMockRes();
  await getFreiburgArea({}, broken);
  assert.equal(broken.statusCode, 500);
  assert.deepEqual(broken.body, { error: "Es ist ein Fehler aufgetreten" });
});
