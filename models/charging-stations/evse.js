"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Evse extends Model {
    static associate(models) {
      Evse.belongsTo(models.Location, {
        foreignKey: "location_id",
        as: "location",
      });
    }
  }

  Evse.init(
    {
      // OCPDB-uid
      evse_uid: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
      },
      location_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      connectors: DataTypes.STRING(120),
      // "STATIC" = Quelle liefert keinen Live-Status
      status: {
        type: DataTypes.ENUM(
          "STATIC",
          "AVAILABLE",
          "CHARGING",
          "RESERVED",
          "BLOCKED",
          "INOPERATIVE",
          "OUTOFORDER",
          "PLANNED",
          "REMOVED",
          "UNKNOWN"
        ),
        allowNull: false,
        defaultValue: "STATIC",
      },
      status_changed_at: DataTypes.DATE,
      last_seen_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "Evse",
      tableName: "Evses",
      timestamps: false,
    }
  );

  return Evse;
};
