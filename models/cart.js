"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Cart extends Model {
    static associate(models) {
      Cart.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
      Cart.belongsTo(models.CarAbo, { foreignKey: 'carAboId', as: 'car' });
      Cart.belongsTo(models.CarAboColor, { foreignKey: 'colorId', as: 'color' });
      Cart.belongsTo(models.CarAboPrice, { foreignKey: 'priceId', as: 'price' });
    }
  }
  Cart.init(
    {
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
      withDeposit: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: "Cart",
    }
  );
  return Cart;
};
