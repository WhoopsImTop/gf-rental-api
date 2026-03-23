'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Carts', 'depositValue', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('Carts', 'calculatedMonthlyPrice', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('Contracts', 'depositValue', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('Contracts', 'calculatedMonthlyPrice', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Carts', 'depositValue');
    await queryInterface.removeColumn('Carts', 'calculatedMonthlyPrice');
    await queryInterface.removeColumn('Contracts', 'depositValue');
    await queryInterface.removeColumn('Contracts', 'calculatedMonthlyPrice');
  }
};
