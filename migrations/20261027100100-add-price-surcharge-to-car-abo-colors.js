"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Monatlicher Aufpreis je Farbe, wird auf jede Zelle der Preis-Matrix addiert.
    await queryInterface.addColumn("CarAboColors", "priceSurcharge", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    // Hält fest, welcher Farbaufpreis beim Vertragsabschluss berechnet wurde.
    await queryInterface.addColumn("Contracts", "colorSurcharge", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("CarAboColors", "priceSurcharge");
    await queryInterface.removeColumn("Contracts", "colorSurcharge");
  },
};
