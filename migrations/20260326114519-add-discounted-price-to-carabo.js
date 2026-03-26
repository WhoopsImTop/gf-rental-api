'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add vin to CarAboColors
    await queryInterface.addColumn('CarAbos', 'strikePrice', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove vin from CarAboColors
    await queryInterface.removeColumn('CarAbos', 'strikePrice');
  }
};
