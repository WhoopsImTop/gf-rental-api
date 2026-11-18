"use strict";

// Ladesäulen-Cache: Cursor und Ergebnis je Sync-Job.
// Jobs: evse_delta, location_delta, location_full
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "SyncStates",
      {
        job: {
          allowNull: false,
          primaryKey: true,
          type: Sequelize.STRING(40),
        },
        // nächster Abruf: last_updated_since = cursor_ts
        cursor_ts: {
          type: Sequelize.DATE,
        },
        last_run_at: {
          type: Sequelize.DATE,
        },
        last_status: {
          type: Sequelize.ENUM("OK", "ERROR"),
        },
        rows_changed: {
          type: Sequelize.INTEGER,
        },
        message: {
          type: Sequelize.STRING(255),
        },
      },
      { charset: "utf8mb4" }
    );

    await queryInterface.bulkInsert("SyncStates", [
      { job: "evse_delta" },
      { job: "location_delta" },
      { job: "location_full" },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("SyncStates");
  },
};
