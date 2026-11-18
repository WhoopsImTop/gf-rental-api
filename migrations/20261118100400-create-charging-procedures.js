"use strict";

// Ladesäulen-Cache: Stored Procedures.
//
// Ablauf nach einem Standort-Sync:
//   CALL refresh_status(NULL); CALL assign_operators();
//   CALL mark_duplicates(40);  CALL recompute_scope('POLYGON((...))', 0);
// Nach einem EVSE-Delta: CALL refresh_status(<location_id>) je betroffenem Standort.
//
// Jede Prozedur wird als eigenes Statement gesendet, DELIMITER braucht es nur im CLI-Client.

const PROCEDURES = {
  // Zähler und state neu berechnen. NULL = alle Standorte, sonst genau einer.
  refresh_status: `
CREATE PROCEDURE refresh_status(IN p_location_id BIGINT UNSIGNED)
BEGIN
  UPDATE Locations l
  LEFT JOIN (
    SELECT location_id,
           COUNT(*)                  AS total,
           SUM(status <> 'STATIC')   AS rt,
           SUM(status = 'AVAILABLE') AS av,
           SUM(status = 'CHARGING')  AS ch
    FROM Evses
    WHERE is_active = 1 AND (p_location_id IS NULL OR location_id = p_location_id)
    GROUP BY location_id
  ) x ON x.location_id = l.location_id
  SET l.evse_total     = COALESCE(x.total, 0),
      l.evse_available = COALESCE(x.av, 0),
      l.state = CASE
                  WHEN COALESCE(x.rt, 0) = 0 THEN 'NO_REALTIME'
                  WHEN x.av > 0              THEN 'FREE'
                  WHEN x.ch > 0              THEN 'OCCUPIED'
                  ELSE 'FAULTY'
                END
  WHERE p_location_id IS NULL OR l.location_id = p_location_id;
END`,

  // Betreiber zuordnen; unbekannte werden mit enbw_coverage='unknown' angelegt.
  assign_operators: `
CREATE PROCEDURE assign_operators()
BEGIN
  INSERT IGNORE INTO Operators (name, match_prefix)
  SELECT MIN(n.raw), n.norm
  FROM (SELECT operator_name_raw AS raw,
               LOWER(REGEXP_REPLACE(operator_name_raw, '[^[:alnum:]]', '')) AS norm
        FROM Locations WHERE operator_id IS NULL AND operator_name_raw IS NOT NULL) n
  WHERE n.norm <> ''
    AND NOT EXISTS (SELECT 1 FROM Operators o WHERE n.norm LIKE CONCAT(o.match_prefix, '%'))
  GROUP BY n.norm;

  UPDATE Locations l
  SET l.operator_id = (
        SELECT o.operator_id FROM Operators o
        WHERE LOWER(REGEXP_REPLACE(l.operator_name_raw, '[^[:alnum:]]', '')) LIKE CONCAT(o.match_prefix, '%')
        ORDER BY CHAR_LENGTH(o.match_prefix) DESC LIMIT 1)
  WHERE l.operator_id IS NULL AND l.operator_name_raw IS NOT NULL;
END`,

  // Dubletten: Standort OHNE Live-Status, der <= p_meter von einem Standort MIT Live-Status
  // (andere Quelle, gleicher Betreiber) liegt, verweist auf diesen.
  // Vorher refresh_status(NULL) + assign_operators().
  mark_duplicates: `
CREATE PROCEDURE mark_duplicates(IN p_meter INT)
BEGIN
  UPDATE Locations SET canonical_location_id = NULL;

  UPDATE Locations s
  JOIN Locations r
    ON r.operator_id = s.operator_id
   AND r.source_uid <> s.source_uid
   AND r.state <> 'NO_REALTIME'
   AND r.is_active = 1
   AND r.lat BETWEEN s.lat - 0.0005 AND s.lat + 0.0005
   AND r.lon BETWEEN s.lon - 0.0008 AND s.lon + 0.0008
  SET s.canonical_location_id = r.location_id
  WHERE s.is_active = 1 AND s.state = 'NO_REALTIME' AND s.operator_id IS NOT NULL
    AND ST_Distance_Sphere(s.geom, r.geom) <= p_meter;
END`,

  // Sichtbarkeit und enbw_plus.
  //   p_polygon_wkt: Freiburg-Polygon als WKT 'POLYGON((lon lat, ...))'; NULL = kein Sperrgebiet.
  //   p_show_unknown: 1 = Betreiber 'unknown' (und ohne Betreiber) außerhalb zeigen, 0 = ausblenden.
  recompute_scope: `
CREATE PROCEDURE recompute_scope(IN p_polygon_wkt TEXT, IN p_show_unknown TINYINT)
BEGIN
  DECLARE v_poly GEOMETRY DEFAULT NULL;
  IF p_polygon_wkt IS NOT NULL THEN
    SET v_poly = ST_GeomFromText(p_polygon_wkt);
  END IF;

  UPDATE Locations l
  LEFT JOIN Operators o ON o.operator_id = l.operator_id
  SET l.enbw_plus = CASE
        WHEN o.enbw_coverage IN ('enbw_own','roaming_partner') THEN 'YES'
        WHEN o.enbw_coverage = 'not_covered'                   THEN 'NO'
        ELSE 'UNKNOWN'
      END,
      l.in_scope = CASE
        WHEN l.is_active = 0 OR l.canonical_location_id IS NOT NULL THEN 0
        WHEN v_poly IS NOT NULL AND ST_Contains(v_poly, l.geom)     THEN COALESCE(o.freiburg_allowed, 0)
        WHEN o.enbw_coverage IN ('enbw_own','roaming_partner')      THEN 1
        WHEN o.enbw_coverage = 'not_covered'                        THEN 0
        ELSE p_show_unknown
      END;
END`,
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (const [name, sql] of Object.entries(PROCEDURES)) {
      await queryInterface.sequelize.query(`DROP PROCEDURE IF EXISTS ${name}`);
      await queryInterface.sequelize.query(sql);
    }
  },

  async down(queryInterface) {
    for (const name of Object.keys(PROCEDURES)) {
      await queryInterface.sequelize.query(`DROP PROCEDURE IF EXISTS ${name}`);
    }
  },
};
