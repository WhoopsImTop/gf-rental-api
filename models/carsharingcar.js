"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CarsharingCar extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CarsharingCar.belongsToMany(models.Media, {
        through: "carsharingCarsImages",
        foreignKey: "carId",
        otherKey: "mediaId",
        as: "images"
      });
    }
  }

  CarsharingCar.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      subline: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      shortDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      equipment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      technicalData: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      weightAndPayload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CarsharingCar",
      tableName: "CarsharingCars",
    }
  );

  return CarsharingCar;
};
