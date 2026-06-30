"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Contracts", "monthlyDepositDiscount", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Contracts"
      SET "monthlyDepositDiscount" = ROUND(
        (CAST("depositValue" AS DECIMAL) * 1.025) / NULLIF("duration", 0),
        2
      )
      WHERE "depositValue" > 0 AND "duration" > 0
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Contracts", "monthlyDepositDiscount");
  },
};
