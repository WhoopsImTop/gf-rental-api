"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class SyncState extends Model {}

  SyncState.init(
    {
      // evse_delta | location_delta | location_full
      job: {
        type: DataTypes.STRING(40),
        primaryKey: true,
      },
      // nächster Abruf: last_updated_since = cursor_ts
      cursor_ts: DataTypes.DATE,
      last_run_at: DataTypes.DATE,
      last_status: DataTypes.ENUM("OK", "ERROR"),
      rows_changed: DataTypes.INTEGER,
      message: DataTypes.STRING(255),
    },
    {
      sequelize,
      modelName: "SyncState",
      tableName: "SyncStates",
      timestamps: false,
    }
  );

  return SyncState;
};
