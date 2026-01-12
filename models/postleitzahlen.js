"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Postleitzahlen extends Model {}
  Postleitzahlen.init(
    {
      Ziel: DataTypes.STRING,
      Zielort: DataTypes.STRING,
      Luftlinie: DataTypes.STRING,
      Fahrstrecke: DataTypes.STRING,
      Fahrzeit: DataTypes.STRING,
      Lieferkosten: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "Postleitzahlen",
      tableName: "Postleitzahlen",
      timestamps: false,
    }
  );
  return Postleitzahlen;
};
