"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface) {
    // Kunden melden sich nicht an. Bisher wurde beim Cantamen-Import ein Hash des
    // Cantamen-Passworts gespeichert – der wird nicht gebraucht und daher entfernt.
    // ACHTUNG: nicht umkehrbar.
    await queryInterface.sequelize.query(
      "UPDATE `Users` SET `passwordHash` = NULL WHERE `role` = 'CUSTOMER'",
    );
  },

  async down() {
    // Entfernte Passwort-Hashes lassen sich nicht wiederherstellen.
  },
};
