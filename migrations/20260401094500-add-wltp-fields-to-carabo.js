"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CarAbos", "energyConsumptionCombinedWltp", {
      type: Sequelize.DECIMAL(4, 1),
      allowNull: true,
    });

    await queryInterface.addColumn("CarAbos", "electricRangeWltp", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("CarAbos", "electricRangeWltp");
    await queryInterface.removeColumn("CarAbos", "energyConsumptionCombinedWltp");
  },
};
