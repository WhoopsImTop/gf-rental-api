"use strict";
const { Model } = require("sequelize");
const { encrypt, decrypt, createHash } = require("../services/encryption");

module.exports = (sequelize, DataTypes) => {
  class VerificationCode extends Model {
    static associate(models) {
      // define association here
    }
  }
  VerificationCode.init(
    {
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue("email", encrypt(value));
        },
        get() {
          const value = this.getDataValue("email");
          return value ? decrypt(value) : null;
        },
      },
      emailHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "VerificationCode",
    }
  );
  return VerificationCode;
};
