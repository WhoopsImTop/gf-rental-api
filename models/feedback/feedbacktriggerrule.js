"use strict";
const { Model } = require("sequelize");
const { parseJsonObject } = require("../../services/feedback/questionOptions");

module.exports = (sequelize, DataTypes) => {
  class FeedbackTriggerRule extends Model {
    static associate(models) {
      FeedbackTriggerRule.belongsTo(models.FeedbackSurvey, {
        foreignKey: "survey_id",
      });
      FeedbackTriggerRule.belongsTo(models.FeedbackQuestion, {
        foreignKey: "question_id",
      });
    }
  }

  FeedbackTriggerRule.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      survey_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      question_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      operator: {
        type: DataTypes.ENUM(
          "equals",
          "contains",
          "lte",
          "gte",
          "not_equals",
        ),
        allowNull: false,
      },
      value: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      action_type: {
        type: DataTypes.ENUM("email", "slack", "db_flag"),
        allowNull: false,
      },
      action_config: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonObject(this.getDataValue("action_config"));
        },
        set(value) {
          this.setDataValue("action_config", parseJsonObject(value));
        },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "FeedbackTriggerRule",
      tableName: "feedback_trigger_rules",
      underscored: true,
    },
  );

  return FeedbackTriggerRule;
};
