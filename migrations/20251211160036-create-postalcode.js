"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Postleitzahlen", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      Ziel: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      Zielort: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      Luftlinie: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      Fahrstrecke: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      Fahrzeit: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      Lieferkosten: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CarAboColors");
  },
};
