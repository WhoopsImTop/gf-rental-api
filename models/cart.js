"use strict";
const crypto = require("crypto");
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Cart extends Model {
    static associate(models) {
      Cart.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      Cart.belongsTo(models.CarAbo, { foreignKey: 'carAboId', as: 'car' });
      Cart.belongsTo(models.CarAboColor, { foreignKey: 'colorId', as: 'color' });
      Cart.belongsTo(models.CarAboPrice, { foreignKey: 'priceId', as: 'price' });
      Cart.hasMany(models.FollowupJob, {
        foreignKey: "cart_id",
        as: "followupJobs",
      });
      Cart.hasMany(models.CartCheckoutEvent, {
        foreignKey: "cartId",
        as: "checkoutEvents",
      });
      Cart.hasMany(models.CartClientError, {
        foreignKey: "cartId",
        as: "clientErrors",
      });
    }
  }
  Cart.init(
    {
      accessToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      carAboId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      colorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      priceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      durationType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'fixed',
      },
      completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      syncedByCantamen: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      customerType: {
        type: DataTypes.ENUM("private", "business"),
        allowNull: false,
        defaultValue: "private",
      },
      depositValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      calculatedMonthlyPrice: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      lastCheckoutStep: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      clientErrorCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      //virtual field if user was synced from cantamen
    },
    {
      sequelize,
      modelName: "Cart",
      hooks: {
        beforeValidate(cart) {
          if (!cart.accessToken || String(cart.accessToken).trim() === "") {
            cart.accessToken = crypto.randomBytes(32).toString("hex");
          }
        },
      },
    }
  );
  return Cart;
};
