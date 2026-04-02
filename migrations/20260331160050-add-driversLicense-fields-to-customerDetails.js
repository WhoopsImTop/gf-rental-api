"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CustomerDetails", "allowedLicenseClasses", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
    await queryInterface.addColumn("CustomerDetails", "licenseValidUntil", {
      type: Sequelize.DATE,
      allowNull: false,
    });
    await queryInterface.addColumn("CustomerDetails", "licenseIssuingPlace", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
    await queryInterface.addColumn("CustomerDetails", "licenseIssuedOn", {
      type: Sequelize.DATE,
      allowNull: false,
    });
    await queryInterface.addColumn("CustomerDetails", "placeOfBirth", {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("CustomerDetails", "allowedLicenseClasses");
    await queryInterface.removeColumn("CustomerDetails", "licenseValidUntil");
    await queryInterface.removeColumn("CustomerDetails", "licenseIssuingPlace");
    await queryInterface.removeColumn("CustomerDetails", "licenseIssuedOn");
    await queryInterface.removeColumn("CustomerDetails", "placeOfBirth");
  },
};
