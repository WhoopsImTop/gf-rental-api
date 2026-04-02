"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CarAbos", "trunkVolume", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("CarAbos", "equipmentPackages", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("CarAbos", "equipmentPackages");
    await queryInterface.removeColumn("CarAbos", "trunkVolume");
  },
};
