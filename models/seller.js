"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Seller extends Model {
    static associate(models) {
      Seller.hasMany(models.CarAbo, {
        foreignKey: "SellerId", // Sequelize Standard
        as: "carAbos",
      });
    }
  }
  Seller.init(
    {
      name: DataTypes.STRING,
      street: DataTypes.STRING,
      housenumber: DataTypes.INTEGER,
      postalcode: DataTypes.INTEGER,
      city: DataTypes.STRING,
      country: DataTypes.STRING,
      website: DataTypes.STRING,
      email: DataTypes.STRING,
      phone: DataTypes.STRING,
      subscriptionFeePercentage: DataTypes.INTEGER,
      subscriptionFeeFixed: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "Seller",
    }
  );
  return Seller;
};
