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
        as: "images",
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
        type: DataTypes.JSON,
        allowNull: true,
      },
      weightAndPayload: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      size: {
        type: DataTypes.ENUM("XXS", "XS", "S", "M", "L", "XL", "XXL"),
        allowNull: true, // Allow null values
      },
      fuel: {
        type: DataTypes.ENUM("Benzin", "Diesel", "Elektro", "Hybrid"),
        allowNull: true, // Allow null values
      },
      gear: {
        type: DataTypes.ENUM("Automatik", "Schaltgetriebe"),
        allowNull: true, // Allow null values
      },
      price: {
        type: DataTypes.FLOAT,
        allowNull: true, // Allow null values
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
