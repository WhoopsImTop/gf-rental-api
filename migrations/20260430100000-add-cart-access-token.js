"use strict";

const crypto = require("crypto");

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = "Carts";
    const desc = await queryInterface.describeTable(table).catch(() => null);
    if (!desc || !desc.accessToken) {
      await queryInterface.addColumn(table, "accessToken", {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }

    const [rows] = await queryInterface.sequelize.query(
      `SELECT id FROM \`${table}\` WHERE accessToken IS NULL OR accessToken = ''`,
    );

    for (const row of rows || []) {
      const token = crypto.randomBytes(32).toString("hex");
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` SET accessToken = :token WHERE id = :id`,
        { replacements: { token, id: row.id } },
      );
    }

    try {
      await queryInterface.addIndex(table, ["accessToken"], {
        unique: true,
        name: "carts_access_token_unique",
      });
    } catch (e) {
      if (!String(e.message || e).includes("Duplicate")) {
        throw e;
      }
    }

    await queryInterface.changeColumn(table, "accessToken", {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
  },

  async down(queryInterface) {
    const table = "Carts";
    try {
      await queryInterface.removeIndex(table, "carts_access_token_unique");
    } catch (e) {
      // ignore
    }
    await queryInterface.removeColumn(table, "accessToken");
  },
};
