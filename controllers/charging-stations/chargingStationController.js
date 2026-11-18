"use strict";

const db = require("../../models");
const { logger } = require("../../services/logging");

// Öffentliche Karte: nur, was recompute_scope() freigegeben hat (in_scope = 1).
const MAX_STATIONS = 1000;
const COORDINATE_PATTERN = /^-?\d{1,3}(\.\d{1,10})?$/;

const LIST_ATTRIBUTES = [
  "location_id",
  "lat",
  "lon",
  "address",
  "city",
  "max_power_kw",
  "evse_total",
  "evse_available",
  "state",
  "enbw_plus",
  "operator_name_raw",
];
const operatorInclude = {
  model: db.Operator,
  as: "operator",
  attributes: ["name"],
};

const parseCoordinate = (value, max) => {
  if (typeof value !== "string" || !COORDINATE_PATTERN.test(value)) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= max ? parsed : null;
};

/** Kartenausschnitt aus fromLat/toLat/fromLon/toLon. */
const parseBounds = (query) => {
  const fromLat = parseCoordinate(query?.fromLat, 90);
  const toLat = parseCoordinate(query?.toLat, 90);
  const fromLon = parseCoordinate(query?.fromLon, 180);
  const toLon = parseCoordinate(query?.toLon, 180);
  if ([fromLat, toLat, fromLon, toLon].includes(null)) {
    return {
      error:
        "Bitte gib einen gültigen Kartenausschnitt an (fromLat, toLat, fromLon, toLon).",
    };
  }
  if (fromLat >= toLat || fromLon >= toLon) {
    return {
      error:
        "Der Kartenausschnitt ist ungültig: from muss kleiner als to sein.",
    };
  }
  return { bounds: { fromLat, toLat, fromLon, toLon } };
};

const parseLocationId = (value) =>
  typeof value === "string" && /^\d{1,19}$/.test(value) ? value : null;

// Werte stammen aus parseBounds (nur Zahlen); MBRContains direkt im WHERE, damit der SPATIAL-Index greift.
const boundsCondition = ({ fromLat, toLat, fromLon, toLon }) => {
  const wkt = `POLYGON((${fromLon} ${fromLat}, ${toLon} ${fromLat}, ${toLon} ${toLat}, ${fromLon} ${toLat}, ${fromLon} ${fromLat}))`;
  return db.sequelize.literal(
    `MBRContains(ST_GeomFromText(${db.sequelize.escape(wkt)}), geom)`,
  );
};

const toNumber = (value) =>
  value === null || value === undefined ? null : Number(value);

const toPublicStation = (location) => ({
  location_id: String(location.location_id),
  lat: toNumber(location.lat),
  lon: toNumber(location.lon),
  address: location.address,
  city: location.city,
  operator: location.operator?.name ?? location.operator_name_raw ?? null,
  max_power_kw: toNumber(location.max_power_kw),
  evse_total: location.evse_total,
  evse_available: location.evse_available,
  state: location.state,
  enbw_plus: location.enbw_plus,
});

exports.getChargingStations = async (req, res) => {
  const { bounds, error } = parseBounds(req.query);
  if (error) return res.status(400).json({ error });

  try {
    const locations = await db.Location.findAll({
      attributes: LIST_ATTRIBUTES,
      where: {
        in_scope: true,
        [db.Sequelize.Op.and]: [boundsCondition(bounds)],
      },
      include: [operatorInclude],
      limit: MAX_STATIONS,
    });
    return res.status(200).json(locations.map(toPublicStation));
  } catch (err) {
    logger("error", `[getChargingStations] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.getChargingStation = async (req, res) => {
  const locationId = parseLocationId(req.params?.id);
  if (!locationId)
    return res.status(400).json({ error: "Ungültige Ladesäulen-ID." });

  try {
    const location = await db.Location.findOne({
      attributes: LIST_ATTRIBUTES,
      where: { location_id: locationId, in_scope: true },
      include: [
        operatorInclude,
        {
          model: db.Evse,
          as: "evses",
          attributes: ["evse_uid", "connectors", "status", "status_changed_at"],
          where: { is_active: true },
          required: false,
          separate: true,
          order: [["evse_uid", "ASC"]],
        },
      ],
    });
    if (!location)
      return res.status(404).json({ error: "Ladesäule nicht gefunden." });

    return res.status(200).json({
      ...toPublicStation(location),
      evses: (location.evses ?? []).map((evse) => ({
        evse_uid: String(evse.evse_uid),
        connectors: evse.connectors,
        status: evse.status,
        status_changed_at: evse.status_changed_at,
      })),
    });
  } catch (err) {
    logger("error", `[getChargingStation] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

/**
 * WKT "POLYGON((lon lat, ...), (...))" -> GeoJSON-Ringe [[[lon, lat], ...], ...].
 * null, wenn das WKT kein gültiges Polygon ist.
 */
const parsePolygonWkt = (wkt) => {
  const match = /^\s*POLYGON\s*\((.*)\)\s*$/is.exec(String(wkt ?? ""));
  if (!match) return null;
  const rings = [...match[1].matchAll(/\(([^()]*)\)/g)].map((ring) =>
    ring[1].split(",").map((point) => point.trim().split(/\s+/).map(Number)),
  );
  const valid =
    rings.length > 0 &&
    rings.every(
      (ring) =>
        ring.length >= 4 &&
        ring.every(
          ([lon, lat, ...rest]) =>
            rest.length === 0 &&
            Number.isFinite(lon) &&
            Number.isFinite(lat) &&
            Math.abs(lon) <= 180 &&
            Math.abs(lat) <= 90,
        ),
    );
  return valid ? rings : null;
};

// Dasselbe Polygon, das recompute_scope() als Freiburg-Gebiet nutzt (zum Einzeichnen in der Karte).
exports.getFreiburgArea = async (req, res) => {
  const configured = String(
    process.env.CHARGING_FREIBURG_POLYGON_WKT ?? "",
  ).trim();
  if (!configured) {
    return res
      .status(404)
      .json({ error: "Kein Freiburg-Gebiet konfiguriert." });
  }
  const rings = parsePolygonWkt(configured);
  if (!rings) {
    logger(
      "warn",
      "[getFreiburgArea] CHARGING_FREIBURG_POLYGON_WKT ist kein gültiges POLYGON.",
    );
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
  return res.status(200).json({
    type: "Feature",
    properties: { name: "Freiburg" },
    geometry: { type: "Polygon", coordinates: rings },
  });
};

// Nur für Tests exportiert
exports._internals = {
  parsePolygonWkt,
  parseBounds,
  parseLocationId,
  toPublicStation,
  MAX_STATIONS,
};
