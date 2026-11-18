"use strict";

// Wirelane löst StromSpeicherMarkt ab: Ein StromSpeicherMarkt-Standort, der höchstens
// p_meter neben einem sichtbaren Wirelane-Standort liegt, wird als dessen Dublette markiert
// (canonical_location_id) und fällt damit in recompute_scope() aus in_scope.
// Betreiber werden über match_prefix erkannt, damit die operator_id egal ist.

const MARK_DUPLICATES_V1 = `
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
END`;

const MARK_DUPLICATES_V2 = `
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

  UPDATE Locations s
  JOIN Operators so ON so.operator_id = s.operator_id AND so.match_prefix = 'stromspeichermarkt'
  JOIN Locations r
    ON r.is_active = 1
   AND r.canonical_location_id IS NULL
   AND r.lat BETWEEN s.lat - 0.0005 AND s.lat + 0.0005
   AND r.lon BETWEEN s.lon - 0.0008 AND s.lon + 0.0008
  JOIN Operators ro ON ro.operator_id = r.operator_id AND ro.match_prefix = 'wirelane'
  SET s.canonical_location_id = r.location_id
  WHERE s.is_active = 1 AND s.canonical_location_id IS NULL
    AND ST_Distance_Sphere(s.geom, r.geom) <= p_meter;
END`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP PROCEDURE IF EXISTS mark_duplicates",
    );
    await queryInterface.sequelize.query(MARK_DUPLICATES_V2);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP PROCEDURE IF EXISTS mark_duplicates",
    );
    await queryInterface.sequelize.query(MARK_DUPLICATES_V1);
  },
};
