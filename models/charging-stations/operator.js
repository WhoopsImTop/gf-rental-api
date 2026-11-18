"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Operator extends Model {
    static associate(models) {
      Operator.hasMany(models.Location, {
        foreignKey: "operator_id",
        as: "locations",
      });
    }
  }

  Operator.init(
    {
      operator_id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(160),
        allowNull: false,
      },
      match_prefix: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: "uq_operator_prefix",
      },
      enbw_coverage: {
        type: DataTypes.ENUM("enbw_own", "roaming_partner", "not_covered", "unknown"),
        allowNull: false,
        defaultValue: "unknown",
      },
      freiburg_allowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "Operator",
      tableName: "Operators",
      timestamps: false,
    }
  );

  return Operator;
};
