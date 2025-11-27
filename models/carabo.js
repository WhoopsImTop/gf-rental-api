"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CarAbo extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CarAbo.belongsTo(models.Seller);
      CarAbo.belongsTo(models.Brand);
      CarAbo.belongsTo(models.Contract);
      CarAbo.belongsToMany(models.Media, {
        through: "MediaCrmCarAbos",
        foreignKey: "mediaId",
        otherKey: "carAboId",
      });
      CarAbo.hasMany(models.CarAboPrice, {
        foreignKey: "carAboId",
        as: "prices",
        onDelete: "CASCADE",
      });
      CarAbo.hasMany(models.CarAboColor, {
        foreignKey: "carAboId",
        as: "colors",
        onDelete: "CASCADE",
      });
    }
  }
  CarAbo.init(
    {
      availableFrom: DataTypes.DATE,
      airConditioning: DataTypes.STRING,
      airbags: DataTypes.STRING,
      needToBeOrdered: DataTypes.BOOLEAN,
      availableInDays: DataTypes.INTEGER,
      brandId: DataTypes.INTEGER,
      cartype: DataTypes.STRING,
      co2Emission: DataTypes.INTEGER,
      configurationFile: DataTypes.STRING,
      configDrive: DataTypes.STRING,
      consumption: DataTypes.INTEGER,
      consumptionCity: DataTypes.INTEGER,
      consumptionHighway: DataTypes.INTEGER,
      description: DataTypes.TEXT,
      displayName: DataTypes.STRING,
      doors: DataTypes.INTEGER,
      efficiencyClass: DataTypes.STRING,
      environmentalBadge: DataTypes.STRING,
      energyClassFile: DataTypes.STRING,
      engine: DataTypes.STRING,
      equipment: DataTypes.JSON,
      equipmentLine: DataTypes.STRING,
      evRange: DataTypes.INTEGER,
      gearshift: DataTypes.STRING,
      indexable: DataTypes.BOOLEAN,
      internalId: DataTypes.INTEGER,
      interiorDecoration: DataTypes.STRING,
      model: DataTypes.STRING,
      milage: DataTypes.INTEGER,
      modelYear: DataTypes.INTEGER,
      vin: DataTypes.STRING,
      status: DataTypes.ENUM("available", "reserved", "unavailable"),
      offerType: DataTypes.ENUM("subscription", "purchase"),
      mediaId: DataTypes.INTEGER,
      parkingAids: DataTypes.STRING,
      power: DataTypes.INTEGER,
      productMarketingLabel: DataTypes.STRING,
      discount: DataTypes.INTEGER,
      seats: DataTypes.INTEGER,
      tires: DataTypes.STRING,
      sellerId: DataTypes.INTEGER,
      contractId: DataTypes.INTEGER,

      // Virtual field to calculate `availableFrom`
      calculatedAvailableFrom: {
        type: DataTypes.VIRTUAL,
        get() {
          if (this.availableInDays) {
            const today = new Date();
            today.setDate(today.getDate() + this.availableInDays);
            return today;
          }
          return null;
        },
      },
    },
    {
      sequelize,
      modelName: "CarAbo",
    }
  );
  return CarAbo;
};
