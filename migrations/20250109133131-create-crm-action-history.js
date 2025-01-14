'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('CrmActionHistories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      crmCustomerId: {
        type: Sequelize.INTEGER
      },
      action: {
        type: Sequelize.ENUM('Anruf', 'E-Mail', 'Brief', 'Änderung', 'Löschung', 'Aktion')
      },
      title: {
        type: Sequelize.STRING
      },
      comment: {
        type: Sequelize.TEXT
      },
      userId: {
        type: Sequelize.INTEGER
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('CrmActionHistories');
  }
};