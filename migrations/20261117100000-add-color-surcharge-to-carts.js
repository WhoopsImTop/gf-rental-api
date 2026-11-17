"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Hält den Farbaufpreis fest, den der Kunde beim Konfigurieren gesehen hat.
    // Der Vertrag rechnet damit, damit spätere Änderungen im CRM den Preis eines
    // offenen Warenkorbs nicht verändern. Bestehende Warenkörbe bleiben null
    // und zahlen keinen Aufpreis.
    await queryInterface.addColumn("Carts", "colorSurcharge", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("Carts", "colorSurcharge");
  },
};
