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
    }
  }
  CarAbo.init(
    {
      availableFrom: DataTypes.DATE,
      needToBeOrdered: DataTypes.BOOLEAN,
      availableInDays: DataTypes.INTEGER,
      colors: DataTypes.JSON,
      brandId: DataTypes.INTEGER,
      cartype: DataTypes.STRING,
      co2emission: DataTypes.INTEGER,
      configurationFile: DataTypes.STRING,
      configDrive: DataTypes.STRING,
      consumption: DataTypes.INTEGER,
      consumptionCity: DataTypes.INTEGER,
      consumptionHighway: DataTypes.INTEGER,
      description: DataTypes.TEXT,
      displayName: DataTypes.STRING,
      doors: DataTypes.INTEGER,
      efficiencyClass: DataTypes.STRING,
      energyClassFile: DataTypes.STRING,
      engine: DataTypes.STRING,
      equipment: DataTypes.JSON,
      equipmentLine: DataTypes.STRING,
      evRange: DataTypes.INTEGER,
      gearshift: DataTypes.STRING,
      indexable: DataTypes.BOOLEAN,
      model: DataTypes.STRING,
      modelYear: DataTypes.INTEGER,
      offerType: DataTypes.ENUM("subscription", "purchase"),
      mediaId: DataTypes.INTEGER,
      power: DataTypes.INTEGER,
      price: DataTypes.JSON,
      extraMilage: DataTypes.JSON,
      productMarketingLabel: DataTypes.STRING,
      discount: DataTypes.INTEGER,
      seats: DataTypes.INTEGER,
      tires: DataTypes.STRING,
      downpayment: DataTypes.INTEGER,
      downpaymentDiscount: DataTypes.INTEGER,
      sellerId: DataTypes.INTEGER,

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
