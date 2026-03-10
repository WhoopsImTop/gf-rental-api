"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CarAboColor extends Model {
    static associate(models) {
      CarAboColor.belongsTo(models.CarAbo, {
        foreignKey: "carAboId",
        as: "carAbo",
      });
      CarAboColor.belongsTo(models.Media, {
        foreignKey: "mediaId",
        as: "media",
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
      mediaId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      additionalImages: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      availableFrom: DataTypes.DATE,
      needToBeOrdered: DataTypes.BOOLEAN,
      availableInDays: DataTypes.INTEGER,
      isOrdered: DataTypes.BOOLEAN,
      internalId: DataTypes.STRING,
      vin: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Virtual field to calculate `availableFrom`
      // Im CarAboColor Model
      calculatedAvailableFrom: {
        type: DataTypes.VIRTUAL,
        get() {
          const availableFrom = this.getDataValue("availableFrom");
          const days = this.getDataValue("availableInDays");

          let baseDate;

          // Logik 1 & 2: availableFrom ist vorhanden
          if (availableFrom) {
            baseDate = new Date(availableFrom);
          }
          // Logik 3: Nur availableInDays ist vorhanden -> Heute als Basis
          else if (days !== null && days !== undefined) {
            baseDate = new Date();
          }
          else {
            return null;
          }

          // Tage addieren (auch wenn days 0 ist)
          if (days !== null && days !== undefined) {
            baseDate.setDate(baseDate.getDate() + Number(days));
          }

          return baseDate.toISOString().split("T")[0]; // Format: YYYY-MM-DD
        },
      },
    },
    {
      sequelize,
      modelName: "CarAboColor",
    }
  );
  return CarAboColor;
};


