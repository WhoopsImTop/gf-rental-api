'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Contracts', 'uploadedContractFile', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'shareTokenHash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'shareRequestedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'shareExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Contracts', 'shareExpiresAt');
    await queryInterface.removeColumn('Contracts', 'shareRequestedAt');
    await queryInterface.removeColumn('Contracts', 'shareTokenHash');
    await queryInterface.removeColumn('Contracts', 'uploadedContractFile');
  },
};
