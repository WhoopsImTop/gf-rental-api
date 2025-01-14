"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CarAbos", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      availableFrom: {
        type: Sequelize.DATE,
      },
      needToBeOrdered: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      availableInDays: {
        type: Sequelize.INTEGER,
      },
      displayName: {
        type: Sequelize.STRING,
      },
      colors: {
        type: Sequelize.JSON,
      },
      brandId: {
        type: Sequelize.INTEGER,
      },
      cartype: {
        type: Sequelize.STRING,
      },
      co2emission: {
        type: Sequelize.INTEGER,
      },
      configurationFile: {
        type: Sequelize.STRING,
      },
      configDrive: {
        type: Sequelize.STRING,
      },
      consumption: {
        type: Sequelize.INTEGER,
      },
      consumptionCity: {
        type: Sequelize.INTEGER,
      },
      consumptionHighway: {
        type: Sequelize.INTEGER,
      },
      description: {
        type: Sequelize.TEXT,
      },
      doors: {
        type: Sequelize.INTEGER,
      },
      efficiencyClass: {
        type: Sequelize.STRING,
      },
      energyClassFile: {
        type: Sequelize.STRING,
      },
      engine: {
        type: Sequelize.STRING,
      },
      equipment: {
        type: Sequelize.JSON,
      },
      equipmentLine: {
        type: Sequelize.STRING,
      },
      evRange: {
        type: Sequelize.INTEGER,
      },
      gearshift: {
        type: Sequelize.STRING,
      },
      indexable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      model: {
        type: Sequelize.STRING,
      },
      modelYear: {
        type: Sequelize.INTEGER,
      },
      offerType: {
        type: Sequelize.ENUM("subscription", "purchase"),
      },
      mediaId: {
        type: Sequelize.INTEGER,
      },
      power: {
        type: Sequelize.INTEGER,
      },
      price: {
        type: Sequelize.JSON,
      },
      extraMilage: {
        type: Sequelize.JSON,
      },
      productMarketingLabel: {
        type: Sequelize.STRING,
      },
      discount: {
        type: Sequelize.INTEGER,
      },
      seats: {
        type: Sequelize.INTEGER,
      },
      tires: {
        type: Sequelize.STRING,
      },
      downpayment: {
        type: Sequelize.INTEGER,
      },
      downpaymentDiscount: {
        type: Sequelize.INTEGER,
      },
      sellerId: {
        type: Sequelize.INTEGER,
      },
      contractId: {
        type: Sequelize.INTEGER,
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
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("CarAbos");
  },
};
