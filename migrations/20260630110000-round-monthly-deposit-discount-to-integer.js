"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "Contracts"
      SET "monthlyDepositDiscount" = ROUND(
        (CAST("depositValue" AS DECIMAL) * 1.025) / NULLIF("duration", 0)
      )
      WHERE "depositValue" > 0 AND "duration" > 0
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE "Contracts"
      SET "monthlyDepositDiscount" = ROUND(
        (CAST("depositValue" AS DECIMAL) * 1.025) / NULLIF("duration", 0),
        2
      )
      WHERE "depositValue" > 0 AND "duration" > 0
    `);
  },
};
