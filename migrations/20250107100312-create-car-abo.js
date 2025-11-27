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
      airConditioning: {
        type: Sequelize.STRING,
      },
      airbags: {
        type: Sequelize.STRING,
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
      brandId: {
        type: Sequelize.INTEGER,
      },
      cartype: {
        type: Sequelize.STRING,
      },
      co2Emission: {
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
      environmentalBadge: {
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
      internalId: {
        type: Sequelize.INTEGER,
      },
      interiorDecoration: {
        type: Sequelize.STRING,
      },
      model: {
        type: Sequelize.STRING,
      },
      milage: {
        type: Sequelize.INTEGER,
      },
      modelYear: {
        type: Sequelize.INTEGER,
      },
      vin: {
        type: Sequelize.STRING,
      },
      status: {
        type: Sequelize.ENUM("available", "reserved", "unavailable"),
        defaultValue: "available",
      },
      offerType: {
        type: Sequelize.ENUM("subscription", "purchase"),
      },
      mediaId: {
        type: Sequelize.INTEGER,
      },
      parkingAids: {
        type: Sequelize.STRING,
      },
      power: {
        type: Sequelize.INTEGER,
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
