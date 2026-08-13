"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CartCheckoutEvent extends Model {
    static associate(models) {
      CartCheckoutEvent.belongsTo(models.Cart, {
        foreignKey: "cartId",
        as: "cart",
      });
    }
  }

  CartCheckoutEvent.init(
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
      eventType: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      stepId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      stepName: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      pageUrl: {
        type: DataTypes.STRING(2048),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "CartCheckoutEvent",
      tableName: "CartCheckoutEvents",
    },
  );

  return CartCheckoutEvent;
};
