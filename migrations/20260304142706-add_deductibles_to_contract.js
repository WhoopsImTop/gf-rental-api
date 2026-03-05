"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Contracts", "insuranceDeductibleHaftpflicht", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn("Contracts", "insuranceDeductibleTeilkasko", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Contracts", "insuranceDeductibleHaftpflicht");
    await queryInterface.removeColumn("Contracts", "insuranceDeductibleTeilkasko");
  },
};
