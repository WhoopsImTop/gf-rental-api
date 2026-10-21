"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface) {
    // Kunden haben keinen Login mehr: alle noch vorhandenen Kunden-Sessions entfernen.
    await queryInterface.sequelize.query(
      "DELETE s FROM `Sessions` s INNER JOIN `Users` u ON u.id = s.userId WHERE u.role = 'CUSTOMER'",
    );
  },

  async down() {
    // Geloeschte Sessions lassen sich nicht wiederherstellen (und sollen es auch nicht).
  },
};
