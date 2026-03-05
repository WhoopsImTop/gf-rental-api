"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Setting", "standardDeductibleHaftpflicht", {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 1500,
    });
    await queryInterface.addColumn("Setting", "standardDeductibleTeilkasko", {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 750,
    });
    await queryInterface.addColumn("Setting", "basicDeductibleHaftpflicht", {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 500,
    });
    await queryInterface.addColumn("Setting", "basicDeductibleTeilkasko", {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 250,
    });
    await queryInterface.addColumn("Setting", "premiumDeductibleHaftpflicht", {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 250,
    });
    await queryInterface.addColumn("Setting", "premiumDeductibleTeilkasko", {
      type: Sequelize.DECIMAL(10, 2),
      defaultValue: 0,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Setting", "standardDeductibleHaftpflicht");
    await queryInterface.removeColumn("Setting", "standardDeductibleTeilkasko");
    await queryInterface.removeColumn("Setting", "basicDeductibleHaftpflicht");
    await queryInterface.removeColumn("Setting", "basicDeductibleTeilkasko");
    await queryInterface.removeColumn("Setting", "premiumDeductibleHaftpflicht");
    await queryInterface.removeColumn("Setting", "premiumDeductibleTeilkasko");
  },
};
