'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Setting', 'basicInsurancePrice', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 20.00
    });
    await queryInterface.addColumn('Setting', 'premiumInsurancePrice', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 40.00
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Setting', 'basicInsurancePrice');
    await queryInterface.removeColumn('Setting', 'premiumInsurancePrice');
  }
};
