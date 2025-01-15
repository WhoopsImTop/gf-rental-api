"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CrmCustomers", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      statusId: {
        type: Sequelize.INTEGER,
      },
      salutation: {
        type: Sequelize.ENUM("Herr", "Frau", "Divers", "Keine Angabe"),
      },
      firstName: {
        type: Sequelize.TEXT,
      },
      lastName: {
        type: Sequelize.TEXT,
      },
      companyName: {
        type: Sequelize.TEXT,
      },
      customerType: {
        type: Sequelize.ENUM(
          "Privatkunde",
          "Firmenkunde",
          "Interessent",
          "Import"
        ),
      },
      email: {
        type: Sequelize.TEXT,
      },
      altEmail: {
        type: Sequelize.TEXT,
      },
      phone: {
        type: Sequelize.TEXT,
      },
      altPhone: {
        type: Sequelize.TEXT,
      },
      website: {
        type: Sequelize.TEXT,
      },
      street: {
        type: Sequelize.TEXT,
      },
      houseNumber: {
        type: Sequelize.TEXT,
      },
      postalCode: {
        type: Sequelize.TEXT,
      },
      city: {
        type: Sequelize.TEXT,
      },
      country: {
        type: Sequelize.TEXT,
      },
      lat: {
        type: Sequelize.DECIMAL(10, 8),
      },
      lng: {
        type: Sequelize.DECIMAL(11, 8),
      },
      callBackDate: {
        type: Sequelize.DATE,
      },
      callBackTime: {
        type: Sequelize.STRING,
      },
      preferredContactMethod: {
        type: Sequelize.ENUM("E-Mail", "Telefon", "Post", "Keine Präferenz"),
      },
      marketingOptIn: {
        type: Sequelize.BOOLEAN,
      },
      marketingOptInDate: {
        type: Sequelize.STRING,
      },
      notes: {
        type: Sequelize.TEXT,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      deletedAt: {
        type: Sequelize.DATE,
      },
      userId: {
        type: Sequelize.INTEGER,
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("CrmCustomers");
  },
};
