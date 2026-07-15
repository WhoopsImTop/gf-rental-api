"use strict";

const { Model } = require("sequelize");
const { encrypt, decrypt } = require("../services/encryption");

module.exports = (sequelize, DataTypes) => {
  class EmailLog extends Model {
    static associate(models) {
      EmailLog.belongsTo(models.User, {
        foreignKey: "relatedUserId",
        as: "relatedUser",
      });
      EmailLog.belongsTo(models.Contract, {
        foreignKey: "relatedContractId",
        as: "relatedContract",
      });
    }
  }

  EmailLog.init(
    {
      mailType: {
        type: DataTypes.ENUM(
          "otp",
          "password_reset",
          "notification",
          "error",
          "custom",
          "contact",
          "feedback",
          "admin_notification",
        ),
        allowNull: false,
      },
      fromAddress: DataTypes.STRING(255),
      toAddress: DataTypes.TEXT,
      ccAddress: DataTypes.TEXT,
      subject: DataTypes.STRING(512),
      bodyText: {
        type: DataTypes.TEXT,
        get() {
          const raw = this.getDataValue("bodyText");
          return raw ? decrypt(raw) : null;
        },
        set(value) {
          this.setDataValue("bodyText", value ? encrypt(String(value)) : null);
        },
      },
      bodyHtml: {
        type: DataTypes.TEXT,
        get() {
          const raw = this.getDataValue("bodyHtml");
          return raw ? decrypt(raw) : null;
        },
        set(value) {
          this.setDataValue("bodyHtml", value ? encrypt(String(value)) : null);
        },
      },
      attachmentCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      attachmentMeta: DataTypes.TEXT,
      messageId: DataTypes.STRING(255),
      status: {
        type: DataTypes.ENUM("sent", "failed", "skipped_dev"),
        allowNull: false,
      },
      errorMessage: DataTypes.TEXT,
      relatedUserId: DataTypes.INTEGER,
      relatedContractId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "EmailLog",
    },
  );

  return EmailLog;
};
