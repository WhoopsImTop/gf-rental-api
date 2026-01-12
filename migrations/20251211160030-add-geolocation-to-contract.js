"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Contracts", "lat", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("Contracts", "lng", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Contracts", "lat");
    await queryInterface.removeColumn("Contracts", "lng");
  },
};
