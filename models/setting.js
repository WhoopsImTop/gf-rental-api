"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Setting extends Model {}
  Setting.init(
    {
      notificationEmails: DataTypes.STRING,
      pricePerKm: DataTypes.DECIMAL(10, 2),
      allowedScore: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "Setting",
      tableName: "setting",
      timestamps: false,
    }
  );
  return Setting;
};
