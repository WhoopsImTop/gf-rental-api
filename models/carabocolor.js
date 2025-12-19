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

      // Virtual field to calculate `availableFrom`
      calculatedAvailableFrom: {
        type: DataTypes.VIRTUAL,
        get() {
          const availableFrom = this.availableFrom;
          const days = this.availableInDays;

          // Wenn es kein Basisdatum gibt → null zurück
          if (!availableFrom) return null;

          // Wenn days nicht gesetzt ist oder 0 → einfach Basisdatum zurück
          if (!days || days === 0) return availableFrom;

          // Hier berechnen wir availableFrom + days
          const date = new Date(availableFrom);
          date.setDate(date.getDate() + days);

          return date;
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
