"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CarAboPrices", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      carAboId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "CarAbos",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      durationMonths: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      mileageKm: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      priceWithDeposit: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      priceNoDeposit: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
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

  async down(queryInterface) {
    await queryInterface.dropTable("CarAboPrices");
  },
};

