"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CarAbos", "batteryCapacity", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("CarAbos", "topSpeed", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("CarAbos", "drive", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("CarAbos", "batteryCapacity");
    await queryInterface.removeColumn("CarAbos", "topSpeed");
    await queryInterface.removeColumn("CarAbos", "drive");
  },
};

