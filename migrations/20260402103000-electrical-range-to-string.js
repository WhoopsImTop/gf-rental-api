"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn("CarAbos", "consumptionHighway", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.changeColumn("CarAbos", "electricRangeWltp", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("CarAbos", "consumptionHighway", {
      type: Sequelize.DECIMAL(4, 1),
      allowNull: true,
    });

    await queryInterface.changeColumn("CarAbos", "electricRangeWltp", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
};

