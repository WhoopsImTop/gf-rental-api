"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Fehlversuche je Code zaehlen (OTP-Login im Checkout, Passwort-Reset im CRM).
    for (const table of ["VerificationCodes", "PasswordResetCodes"]) {
      await queryInterface.addColumn(table, "attempts", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    for (const table of ["VerificationCodes", "PasswordResetCodes"]) {
      await queryInterface.removeColumn(table, "attempts");
    }
  },
};
