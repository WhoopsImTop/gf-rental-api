"use strict";
const { Model } = require("sequelize");

// Tages-Salt für die cookielose Besucher-ID. Es existiert immer nur der Salt
// des aktuellen Tages; ältere werden beim Tageswechsel gelöscht.
module.exports = (sequelize, DataTypes) => {
  class AnalyticsSalt extends Model {}
  AnalyticsSalt.init(
    {
      day: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      salt: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "AnalyticsSalt",
    },
  );
  return AnalyticsSalt;
};
