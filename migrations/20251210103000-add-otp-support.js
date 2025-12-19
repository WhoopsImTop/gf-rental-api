'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create VerificationCodes table
    await queryInterface.createTable('VerificationCodes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // 2. Modify Users table: change passwordHash to be nullable
    // Note: older Sequelize/MySQL versions might need valid syntax. 
    // Usually modifying column to allow null.
    await queryInterface.changeColumn('Users', 'passwordHash', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert VerificationCodes
    await queryInterface.dropTable('VerificationCodes');
    
    // Revert Users passwordHash (might fail if there are nulls now)
    // We try to set it back to not null, but this operation is risky if data exists.
    // For now we can try:
    await queryInterface.changeColumn('Users', 'passwordHash', {
      type: Sequelize.TEXT,
      allowNull: false
    });
  }
};
