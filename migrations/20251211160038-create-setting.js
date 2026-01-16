"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Setting", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      notificationEmails: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      pricePerKm: {
        type: Sequelize.DataTypes.DECIMAL(10, 2),
      },
      allowedScore: {
        type: Sequelize.STRING,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Setting");
  },
};
