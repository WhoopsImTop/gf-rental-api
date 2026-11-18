"use strict";

// Ladesäulen-Cache: Betreiber + Zuordnungsregel.
// match_prefix = Rohname kleingeschrieben ohne Leerzeichen/Satzzeichen (z.B. "wirelane").
// Bei mehreren Treffern gewinnt der längste Präfix (siehe assign_operators()).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "Operators",
      {
        operator_id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER.UNSIGNED,
        },
        name: {
          type: Sequelize.STRING(160),
          allowNull: false,
        },
        match_prefix: {
          type: Sequelize.STRING(160),
          allowNull: false,
        },
        enbw_coverage: {
          type: Sequelize.ENUM("enbw_own", "roaming_partner", "not_covered", "unknown"),
          allowNull: false,
          defaultValue: "unknown",
        },
        // darf im Freiburg-Polygon angezeigt werden
        freiburg_allowed: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
      },
      { charset: "utf8mb4" }
    );

    await queryInterface.addIndex("Operators", ["match_prefix"], {
      unique: true,
      name: "uq_operator_prefix",
    });

    // Startdaten
    await queryInterface.bulkInsert("Operators", [
      { name: "StromSpeicherMarkt", match_prefix: "stromspeichermarkt", enbw_coverage: "unknown", freiburg_allowed: true },
      { name: "Wirelane", match_prefix: "wirelane", enbw_coverage: "unknown", freiburg_allowed: true },
      { name: "EnBW", match_prefix: "enbw", enbw_coverage: "enbw_own", freiburg_allowed: false },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Operators");
  },
};
