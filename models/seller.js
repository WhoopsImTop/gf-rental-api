"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Seller extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Seller.belongsTo(models.CarAbo);
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
