"use strict";

// refresh_status(NULL) hing auf dem Server stundenlang mit 100 % CPU: Der Plan für den
// JOIN auf die abgeleitete Tabelle (GROUP BY über Evses) hängt vom Optimizer der
// MariaDB-Version ab. V2 zählt deshalb in eine temporäre Tabelle mit Primärschlüssel,
// der JOIN läuft immer über diesen Schlüssel. Für einen einzelnen Standort wird ohne
// "p IS NULL OR ..." direkt über ix_evse_location gezählt. Ergebnis wie in V1.

const REFRESH_STATUS_V1 = `
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
END`;

const REFRESH_STATUS_V2 = `
CREATE PROCEDURE refresh_status(IN p_location_id BIGINT UNSIGNED)
BEGIN
  DECLARE v_total INT DEFAULT 0;
  DECLARE v_rt INT DEFAULT 0;
  DECLARE v_av INT DEFAULT 0;
  DECLARE v_ch INT DEFAULT 0;

  IF p_location_id IS NULL THEN
    DROP TEMPORARY TABLE IF EXISTS tmp_evse_counts;
    CREATE TEMPORARY TABLE tmp_evse_counts (
      location_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      total INT NOT NULL,
      rt INT NOT NULL,
      av INT NOT NULL,
      ch INT NOT NULL
    ) ENGINE = MEMORY;

    INSERT INTO tmp_evse_counts
    SELECT location_id,
           COUNT(*),
           SUM(status <> 'STATIC'),
           SUM(status = 'AVAILABLE'),
           SUM(status = 'CHARGING')
    FROM Evses
    WHERE is_active = 1
    GROUP BY location_id;

    UPDATE Locations l
    LEFT JOIN tmp_evse_counts x ON x.location_id = l.location_id
    SET l.evse_total     = COALESCE(x.total, 0),
        l.evse_available = COALESCE(x.av, 0),
        l.state = CASE
                    WHEN COALESCE(x.rt, 0) = 0 THEN 'NO_REALTIME'
                    WHEN x.av > 0              THEN 'FREE'
                    WHEN x.ch > 0              THEN 'OCCUPIED'
                    ELSE 'FAULTY'
                  END;

    DROP TEMPORARY TABLE tmp_evse_counts;
  ELSE
    SELECT COUNT(*),
           COALESCE(SUM(status <> 'STATIC'), 0),
           COALESCE(SUM(status = 'AVAILABLE'), 0),
           COALESCE(SUM(status = 'CHARGING'), 0)
      INTO v_total, v_rt, v_av, v_ch
    FROM Evses
    WHERE location_id = p_location_id AND is_active = 1;

    UPDATE Locations
    SET evse_total     = v_total,
        evse_available = v_av,
        state = CASE
                  WHEN v_rt = 0 THEN 'NO_REALTIME'
                  WHEN v_av > 0 THEN 'FREE'
                  WHEN v_ch > 0 THEN 'OCCUPIED'
                  ELSE 'FAULTY'
                END
    WHERE location_id = p_location_id;
  END IF;
END`;

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP PROCEDURE IF EXISTS refresh_status",
    );
    await queryInterface.sequelize.query(REFRESH_STATUS_V2);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DROP PROCEDURE IF EXISTS refresh_status",
    );
    await queryInterface.sequelize.query(REFRESH_STATUS_V1);
  },
};
