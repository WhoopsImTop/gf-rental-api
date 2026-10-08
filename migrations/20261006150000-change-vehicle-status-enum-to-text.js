"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // vehicleStatus: ENUM('used', 'new') -> TEXT
    await queryInterface.changeColumn("CarAbos", "vehicleStatus", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("CarAbos", "vehicleStatus", {
      type: Sequelize.ENUM("used", "new"),
      allowNull: true,
    });
  },
};
