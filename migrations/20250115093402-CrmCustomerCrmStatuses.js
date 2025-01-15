"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CrmCustomerCrmStatuses", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      crmCustomerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "CrmCustomers", // Name der Tabelle für das User-Modell
          key: "id",
        },
        onDelete: "CASCADE",
      },
      crmStatusId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "CrmStatuses", // Name der Tabelle für das CrmCustomer-Modell
          key: "id",
        },
        onDelete: "CASCADE",
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
  },
};
