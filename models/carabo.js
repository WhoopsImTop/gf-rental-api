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
      CarAbo.belongsTo(models.Seller, {
        foreignKey: "sellerId",
        as: "seller",
      });
      CarAbo.belongsTo(models.Brand);
      CarAbo.hasMany(models.Contract, {
        foreignKey: "carAboId",
        as: "contracts",
        onDelete: "CASCADE",
      });
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
      CarAbo.hasMany(models.CarAboMedia, {
        foreignKey: "carAboId",
        as: "media",
        onDelete: "CASCADE",
      });
    }
  }
  CarAbo.init(
    {
      airConditioning: DataTypes.STRING,
      airbags: DataTypes.STRING,
      cartype: DataTypes.STRING,
      co2Emission: DataTypes.INTEGER,
      configurationFile: DataTypes.STRING,
      configDrive: DataTypes.STRING,
      consumption: DataTypes.INTEGER,
      consumptionCity: DataTypes.INTEGER,
      consumptionHighway: DataTypes.INTEGER,
      description: DataTypes.TEXT,
      displayName: DataTypes.STRING,
      displacement: DataTypes.INTEGER,
      driveType: DataTypes.STRING,
      doors: DataTypes.INTEGER,
      efficiencyClass: DataTypes.STRING,
      environmentalBadge: DataTypes.STRING,
      energyClassFile: DataTypes.STRING,
      emissionClass: DataTypes.STRING,
      engine: DataTypes.STRING,
      equipment: DataTypes.JSON,
      equipmentLine: DataTypes.STRING,
      evRange: DataTypes.INTEGER,
      fuel: DataTypes.STRING,
      gearshift: DataTypes.STRING,
      indexable: DataTypes.BOOLEAN,
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
      premiumLine: DataTypes.BOOLEAN,
      vehicleStatus: DataTypes.ENUM("used", "new"),
      marketingImageDesktop: DataTypes.STRING,
      marketingImageMobile: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "CarAbo",
    }
  );
  return CarAbo;
};
