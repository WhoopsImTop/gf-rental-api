"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class FeedbackAnswer extends Model {
    static associate(models) {
      FeedbackAnswer.belongsTo(models.FeedbackSession, {
        foreignKey: "session_id",
      });
      FeedbackAnswer.belongsTo(models.FeedbackQuestion, {
        foreignKey: "question_id",
      });
    }
  }

  FeedbackAnswer.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      session_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      question_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "FeedbackAnswer",
      tableName: "feedback_answers",
      underscored: true,
    },
  );

  return FeedbackAnswer;
};
