"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CarsharingCarsImages extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CarsharingCarsImages.belongsTo(models.CarsharingCar, {
        foreignKey: "carId",
        as: "car",
      });
      CarsharingCarsImages.belongsTo(models.Media, {
        foreignKey: "mediaId",
        as: "media",
      });
    }
  }

  CarsharingCarsImages.init(
    {
      carId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "CarsharingCars",
          key: "id",
        },
      },
      mediaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Media",
          key: "id",
        },
      },
      order: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0, // Default order value
      },
    },
    {
      sequelize,
      modelName: "CarsharingCarsImages",
      tableName: "carsharingCarsImages",
    }
  );

  return CarsharingCarsImages;
};
