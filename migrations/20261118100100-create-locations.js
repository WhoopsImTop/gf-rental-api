"use strict";

// Ladesäulen-Cache: ein Standort (OCPDB). evse_total, evse_available und state
// pflegt refresh_status(); enbw_plus und in_scope pflegt recompute_scope().
// geom = POINT(lon lat), SRID 0.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "Locations",
      {
        // OCPDB-ID, kommt von außen -> kein autoIncrement
        location_id: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.BIGINT.UNSIGNED,
        },
        // z.B. bnetza_api, datex2_wirelane
        source_uid: {
          type: Sequelize.STRING(64),
          allowNull: false,
        },
        original_id: {
          type: Sequelize.STRING(128),
          allowNull: false,
        },
        // nur für die Betreiber-Zuordnung
        operator_name_raw: {
          type: Sequelize.STRING(160),
        },
        operator_id: {
          type: Sequelize.INTEGER.UNSIGNED,
          references: { model: "Operators", key: "operator_id" },
          onUpdate: "CASCADE",
          // Betreiber gelöscht -> Standort bleibt, assign_operators() ordnet neu zu
          onDelete: "SET NULL",
        },
        address: {
          type: Sequelize.STRING(200),
        },
        city: {
          type: Sequelize.STRING(100),
        },
        lat: {
          type: Sequelize.DECIMAL(9, 6),
          allowNull: false,
        },
        lon: {
          type: Sequelize.DECIMAL(9, 6),
          allowNull: false,
        },
        // NOT NULL ist Pflicht für den SPATIAL-Index
        geom: {
          type: Sequelize.GEOMETRY("POINT"),
          allowNull: false,
        },
        max_power_kw: {
          type: Sequelize.DECIMAL(7, 1),
        },
        evse_total: {
          type: Sequelize.SMALLINT.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        evse_available: {
          type: Sequelize.SMALLINT.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
        },
        state: {
          type: Sequelize.ENUM("NO_REALTIME", "FREE", "OCCUPIED", "FAULTY"),
          allowNull: false,
          defaultValue: "NO_REALTIME",
        },
        enbw_plus: {
          type: Sequelize.ENUM("YES", "NO", "UNKNOWN"),
          allowNull: false,
          defaultValue: "UNKNOWN",
        },
        // gesetzt = Dublette dieses Standorts
        canonical_location_id: {
          type: Sequelize.BIGINT.UNSIGNED,
        },
        // das filtert die App
        in_scope: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        last_seen_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      { charset: "utf8mb4" }
    );

    await queryInterface.addIndex("Locations", ["source_uid", "original_id"], {
      unique: true,
      name: "uq_location_source",
    });
    await queryInterface.addIndex("Locations", ["operator_id"], {
      name: "ix_location_operator",
    });
    await queryInterface.addIndex("Locations", ["geom"], {
      type: "SPATIAL",
      name: "sx_location_geom",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Locations");
  },
};
