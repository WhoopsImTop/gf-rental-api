"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class DeliveryPlace extends Model {}

  DeliveryPlace.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      street: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      houseNumber: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      postalCode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      city: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      lng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: false,
      },
      radiusKm: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: false,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "DeliveryPlace",
      tableName: "DeliveryPlaces",
      timestamps: true,
    }
  );

  return DeliveryPlace;
};
