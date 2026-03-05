"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Setting extends Model { }
  Setting.init(
    {
      notificationEmails: DataTypes.STRING,
      pricePerKm: DataTypes.DECIMAL(10, 2),
      allowedScore: DataTypes.STRING,
      basicInsurancePrice: DataTypes.DECIMAL(10, 2),
      premiumInsurancePrice: DataTypes.DECIMAL(10, 2),
      standardDeductibleHaftpflicht: DataTypes.DECIMAL(10, 2),
      standardDeductibleTeilkasko: DataTypes.DECIMAL(10, 2),
      basicDeductibleHaftpflicht: DataTypes.DECIMAL(10, 2),
      basicDeductibleTeilkasko: DataTypes.DECIMAL(10, 2),
      premiumDeductibleHaftpflicht: DataTypes.DECIMAL(10, 2),
      premiumDeductibleTeilkasko: DataTypes.DECIMAL(10, 2),
    },
    {
      sequelize,
      modelName: "Setting",
      tableName: "Setting",
      timestamps: false,
    }
  );
  return Setting;
};
