"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CarAboColor extends Model {
    static associate(models) {
      CarAboColor.belongsTo(models.CarAbo, {
        foreignKey: "carAboId",
        as: "carAbo",
      });
    }
  }
  CarAboColor.init(
    {
      carAboId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      colorName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      hexCode: {
        type: DataTypes.STRING(7),
        allowNull: true,
      },
      vehicleImageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      additionalImages: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CarAboColor",
    }
  );
  return CarAboColor;
};

