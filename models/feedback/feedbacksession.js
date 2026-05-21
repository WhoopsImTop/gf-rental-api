"use strict";
const { Model } = require("sequelize");
const { parseJsonObject } = require("../../services/feedback/questionOptions");

module.exports = (sequelize, DataTypes) => {
  class FeedbackSession extends Model {
    static associate(models) {
      FeedbackSession.belongsTo(models.FeedbackSurvey, {
        foreignKey: "survey_id",
      });
      FeedbackSession.hasMany(models.FeedbackAnswer, {
        foreignKey: "session_id",
        as: "answers",
        onDelete: "CASCADE",
      });
    }
  }

  FeedbackSession.init(
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
      external_reference_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      respondent_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      respondent_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "completed"),
        defaultValue: "pending",
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseJsonObject(this.getDataValue("metadata"));
        },
        set(value) {
          this.setDataValue("metadata", parseJsonObject(value));
        },
      },
    },
    {
      sequelize,
      modelName: "FeedbackSession",
      tableName: "feedback_sessions",
      underscored: true,
    },
  );

  return FeedbackSession;
};
