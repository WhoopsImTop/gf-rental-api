"use strict";

const { query } = require("express-validator");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CarsharingCars", "size", {
      type: Sequelize.ENUM("XXS", "XS", "S", "M", "L", "XL", "XXL"),
      allowNull: true, // Allow null values
    });
    await queryInterface.addColumn("CarsharingCars", "fuel", {
      type: Sequelize.ENUM("Benzin", "Diesel", "Elektro", "Hybrid"),
      allowNull: true, // Allow null values
    });
    await queryInterface.addColumn("CarsharingCars", "price", {
      type: Sequelize.FLOAT,
      allowNull: true, // Allow null values
    });
    await queryInterface.addColumn("CarsharingCars", "gear", {
      type: Sequelize.ENUM("Automatik", "Schaltgetriebe"),
      allowNull: true, // Allow null values
    });
  },
};
