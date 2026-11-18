"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Location extends Model {
    static associate(models) {
      Location.belongsTo(models.Operator, {
        foreignKey: "operator_id",
        as: "operator",
      });
      Location.hasMany(models.Evse, {
        foreignKey: "location_id",
        as: "evses",
        onDelete: "CASCADE",
      });
      // gesetzt = Dublette, verweist auf den Standort mit Live-Status
      Location.belongsTo(models.Location, {
        foreignKey: "canonical_location_id",
        as: "canonical",
        constraints: false,
      });
    }

    // GeoJSON-Punkt für geom. Achtung: Reihenfolge ist (lon, lat).
    static point(lat, lon) {
      return { type: "Point", coordinates: [Number(lon), Number(lat)] };
    }
  }

  Location.init(
    {
      // OCPDB-ID
      location_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
      },
      source_uid: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: "uq_location_source",
      },
      original_id: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: "uq_location_source",
      },
      operator_name_raw: DataTypes.STRING(160),
      operator_id: DataTypes.INTEGER.UNSIGNED,
      address: DataTypes.STRING(200),
      city: DataTypes.STRING(100),
      lat: {
        type: DataTypes.DECIMAL(9, 6),
        allowNull: false,
      },
      lon: {
        type: DataTypes.DECIMAL(9, 6),
        allowNull: false,
      },
      // POINT(lon lat) – siehe Location.point()
      geom: {
        type: DataTypes.GEOMETRY("POINT"),
        allowNull: false,
      },
      max_power_kw: DataTypes.DECIMAL(7, 1),

      // gepflegt von refresh_status()
      evse_total: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      evse_available: {
        type: DataTypes.SMALLINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      state: {
        type: DataTypes.ENUM("NO_REALTIME", "FREE", "OCCUPIED", "FAULTY"),
        allowNull: false,
        defaultValue: "NO_REALTIME",
      },

      // gepflegt von mark_duplicates() / recompute_scope()
      enbw_plus: {
        type: DataTypes.ENUM("YES", "NO", "UNKNOWN"),
        allowNull: false,
        defaultValue: "UNKNOWN",
      },
      canonical_location_id: DataTypes.BIGINT.UNSIGNED,
      in_scope: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

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
      modelName: "Location",
      tableName: "Locations",
      timestamps: false,
    }
  );

  return Location;
};
