"use strict";

const { Model } = require("sequelize");
const { encrypt, decrypt } = require("../services/encryption");

module.exports = (sequelize, DataTypes) => {
  class FollowupJob extends Model {
    static associate(models) {
      FollowupJob.belongsTo(models.FollowupRule, {
        foreignKey: "rule_id",
        as: "rule",
      });
      FollowupJob.belongsTo(models.Cart, {
        foreignKey: "cart_id",
        as: "cart",
      });
      FollowupJob.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "user",
      });
      FollowupJob.belongsTo(models.CarAbo, {
        foreignKey: "car_abo_id",
        as: "car",
      });
    }
  }

  FollowupJob.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      rule_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      cart_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      to_email: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const raw = this.getDataValue("to_email");
          return raw ? decrypt(raw) : null;
        },
        set(value) {
          this.setDataValue(
            "to_email",
            value ? encrypt(String(value).trim()) : null,
          );
        },
      },
      car_abo_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      send_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "processing",
          "sent",
          "cancelled",
          "failed",
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      cancel_reason: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      sent_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "FollowupJob",
      tableName: "followup_jobs",
      underscored: true,
    },
  );

  return FollowupJob;
};
