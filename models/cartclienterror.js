"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CartClientError extends Model {
    static associate(models) {
      CartClientError.belongsTo(models.Cart, {
        foreignKey: "cartId",
        as: "cart",
      });
    }
  }

  CartClientError.init(
    {
      cartId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      accessToken: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      sessionId: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      message: {
        type: DataTypes.STRING(1024),
        allowNull: false,
      },
      stack: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      source: {
        type: DataTypes.STRING(64),
        allowNull: false,
        defaultValue: "window",
      },
      pageUrl: {
        type: DataTypes.STRING(2048),
        allowNull: true,
      },
      stepName: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CartClientError",
      tableName: "CartClientErrors",
    },
  );

  return CartClientError;
};
