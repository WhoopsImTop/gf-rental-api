'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('CarAboMedia', 'type', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('CarAboMedia', 'sortOrder', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('CarAboMedia', 'type');
    await queryInterface.removeColumn('CarAboMedia', 'sortOrder');
  }
};
