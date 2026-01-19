"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Contracts", "pickupLocationName", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("Contracts", "pickupLocationLat", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("Contracts", "pickupLocationLng", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Contracts", "pickupLocationName");
    await queryInterface.removeColumn("Contracts", "pickupLocationLat");
    await queryInterface.removeColumn("Contracts", "pickupLocationLng");
  },
};
