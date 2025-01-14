"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CustomerDetails", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      birthday: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      street: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      housenumber: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      postalCode: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      country: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      newsletter: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      allowsCreditworthyCheck: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      allowedToPurchase: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      acceptPrivacyPolicy: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      driversLicenseNumber: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      IdCardNumber: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("CustomerDetails");
  },
};
