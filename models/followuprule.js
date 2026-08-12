"use strict";

const { Model } = require("sequelize");

function parseCancelConditions(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = (sequelize, DataTypes) => {
  class FollowupRule extends Model {
    static associate(models) {
      FollowupRule.hasMany(models.FollowupJob, {
        foreignKey: "rule_id",
        as: "jobs",
      });
    }
  }

  FollowupRule.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      trigger_event: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      timing_type: {
        type: DataTypes.ENUM("after_event", "before_anchor"),
        allowNull: false,
        defaultValue: "after_event",
      },
      delay_minutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      anchor_field: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      cancel_conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseCancelConditions(this.getDataValue("cancel_conditions"));
        },
        set(value) {
          this.setDataValue(
            "cancel_conditions",
            Array.isArray(value) ? value.map(String) : [],
          );
        },
      },
      subject: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      body_html: {
        type: DataTypes.TEXT,
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
      modelName: "FollowupRule",
      tableName: "followup_rules",
      underscored: true,
    },
  );

  return FollowupRule;
};
