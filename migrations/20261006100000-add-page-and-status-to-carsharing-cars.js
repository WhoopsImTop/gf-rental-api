"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CarsharingCars", "status", {
      type: Sequelize.ENUM("active", "coming_soon", "hidden"),
      allowNull: false,
      defaultValue: "active",
    });
    await queryInterface.addColumn("CarsharingCars", "availableFrom", {
      type: Sequelize.DATEONLY,
      allowNull: true,
    });
    await queryInterface.addColumn("CarsharingCars", "comingSoonText", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("CarsharingCars", "pageEnabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("CarsharingCars", "pageBlocks", {
      type: Sequelize.JSON,
      allowNull: true,
    });

    // Die Spalte "order" wird vom Controller schon lange geschrieben, wurde aber
    // nie per Migration angelegt – nur hinzufügen, falls sie noch fehlt.
    const imagesTable = await queryInterface.describeTable("carsharingCarsImages");
    if (!imagesTable.order) {
      await queryInterface.addColumn("carsharingCarsImages", "order", {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      });
    }
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("CarsharingCars", "pageBlocks");
    await queryInterface.removeColumn("CarsharingCars", "pageEnabled");
    await queryInterface.removeColumn("CarsharingCars", "comingSoonText");
    await queryInterface.removeColumn("CarsharingCars", "availableFrom");
    await queryInterface.removeColumn("CarsharingCars", "status");
  },
};
