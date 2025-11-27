"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CarAboPrice extends Model {
    static associate(models) {
      CarAboPrice.belongsTo(models.CarAbo, {
        foreignKey: "carAboId",
        as: "carAbo",
      });
    }
  }
  CarAboPrice.init(
    {
      carAboId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      durationMonths: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      mileageKm: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      priceWithDeposit: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      priceNoDeposit: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CarAboPrice",
    }
  );
  return CarAboPrice;
};

