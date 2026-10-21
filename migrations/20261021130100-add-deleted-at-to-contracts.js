"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Soft-Delete fuer Vertraege (Model: paranoid: true).
    await queryInterface.addColumn("Contracts", "deletedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Contracts", "deletedAt");
  },
};
