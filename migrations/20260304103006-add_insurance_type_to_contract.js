'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Contracts', 'insuranceType', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'none'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Contracts', 'insuranceType');
  }
};
