'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Contracts', 'signStatus', {
      type: Sequelize.ENUM(
        'not_requested',
        'pending_signature',
        'signed',
        'expired',
      ),
      allowNull: false,
      defaultValue: 'not_requested',
    });
    await queryInterface.addColumn('Contracts', 'signTokenHash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signRequestedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signTokenUsedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signedAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signatureImagePath', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signedContractFile', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signatureIp', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signatureUserAgent', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('Contracts', 'signatureFullName', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Contracts', 'signatureFullName');
    await queryInterface.removeColumn('Contracts', 'signatureUserAgent');
    await queryInterface.removeColumn('Contracts', 'signatureIp');
    await queryInterface.removeColumn('Contracts', 'signedContractFile');
    await queryInterface.removeColumn('Contracts', 'signatureImagePath');
    await queryInterface.removeColumn('Contracts', 'signedAt');
    await queryInterface.removeColumn('Contracts', 'signTokenUsedAt');
    await queryInterface.removeColumn('Contracts', 'signExpiresAt');
    await queryInterface.removeColumn('Contracts', 'signRequestedAt');
    await queryInterface.removeColumn('Contracts', 'signTokenHash');
    await queryInterface.removeColumn('Contracts', 'signStatus');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Contracts_signStatus";',
    );
  },
};
