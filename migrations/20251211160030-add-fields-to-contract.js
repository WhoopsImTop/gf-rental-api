'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Contracts', 'carAboId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'colorId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'priceId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'withDeposit', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Contracts', 'carAboId');
    await queryInterface.removeColumn('Contracts', 'colorId');
    await queryInterface.removeColumn('Contracts', 'priceId');
    await queryInterface.removeColumn('Contracts', 'withDeposit');
  }
};
