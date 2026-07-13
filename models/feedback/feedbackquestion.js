"use strict";
const { Model } = require("sequelize");
const {
  parseQuestionOptions,
  serializeQuestionOptions,
} = require("../../services/feedback/questionOptions");

module.exports = (sequelize, DataTypes) => {
  class FeedbackQuestion extends Model {
    static associate(models) {
      FeedbackQuestion.belongsTo(models.FeedbackSurvey, {
        foreignKey: "survey_id",
      });
    }
  }

  FeedbackQuestion.init(
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
      question_text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM(
          "single_choice",
          "multi_choice",
          "text",
          "rating",
          "nps",
        ),
        allowNull: false,
      },
      options: {
        type: DataTypes.JSON,
        allowNull: true,
        get() {
          return parseQuestionOptions(this.getDataValue("options"));
        },
        set(value) {
          this.setDataValue("options", serializeQuestionOptions(value));
        },
      },
      is_required: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      required_if: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      group_key: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      group_label: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      show_if: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      order_index: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: "FeedbackQuestion",
      tableName: "feedback_questions",
      underscored: true,
    },
  );

  return FeedbackQuestion;
};
