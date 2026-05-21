"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class FeedbackSurvey extends Model {
    static associate(models) {
      FeedbackSurvey.hasMany(models.FeedbackQuestion, {
        foreignKey: "survey_id",
        as: "questions",
        onDelete: "CASCADE",
      });
      FeedbackSurvey.hasMany(models.FeedbackSession, {
        foreignKey: "survey_id",
        as: "sessions",
      });
      FeedbackSurvey.hasMany(models.FeedbackTriggerRule, {
        foreignKey: "survey_id",
        as: "triggerRules",
      });
    }
  }

  FeedbackSurvey.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "FeedbackSurvey",
      tableName: "feedback_surveys",
      underscored: true,
    },
  );

  return FeedbackSurvey;
};
