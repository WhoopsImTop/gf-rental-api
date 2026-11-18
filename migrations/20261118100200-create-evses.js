"use strict";

// Ladesäulen-Cache: ein Ladepunkt (EVSE). Hier landet der Echtzeit-Status.
// status "STATIC" = diese Quelle liefert keinen Live-Status.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "Evses",
      {
        // OCPDB-uid (gleich in /evses und in Standortdaten) -> kein autoIncrement
        evse_uid: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.BIGINT.UNSIGNED,
        },
        location_id: {
          type: Sequelize.BIGINT.UNSIGNED,
          allowNull: false,
          references: { model: "Locations", key: "location_id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        // z.B. "CCS 150kW | Typ2 22kW"
        connectors: {
          type: Sequelize.STRING(120),
        },
        status: {
          type: Sequelize.ENUM(
            "STATIC",
            "AVAILABLE",
            "CHARGING",
            "RESERVED",
            "BLOCKED",
            "INOPERATIVE",
            "OUTOFORDER",
            "PLANNED",
            "REMOVED",
            "UNKNOWN"
          ),
          allowNull: false,
          defaultValue: "STATIC",
        },
        // letzte Änderung laut Quelle
        status_changed_at: {
          type: Sequelize.DATE,
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

    await queryInterface.addIndex("Evses", ["location_id"], {
      name: "ix_evse_location",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Evses");
  },
};
