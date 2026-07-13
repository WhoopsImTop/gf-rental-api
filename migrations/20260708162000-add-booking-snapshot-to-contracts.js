'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Contracts', 'bookingSnapshot', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'bookingSnapshotHash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Contracts', 'bookingSnapshotHash');
    await queryInterface.removeColumn('Contracts', 'bookingSnapshot');
  },
};

