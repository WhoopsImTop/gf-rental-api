"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CarAboColors", {
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
      colorName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      hexCode: {
        type: Sequelize.STRING(7),
      },
      vehicleImageUrl: {
        type: Sequelize.STRING,
      },
      additionalImages: {
        type: Sequelize.JSON,
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
    await queryInterface.dropTable("CarAboColors");
  },
};

