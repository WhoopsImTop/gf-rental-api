"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      User.hasOne(models.CustomerDetails, {
        foreignKey: "userId",
        as: "customerDetails",
      });
      User.hasMany(models.Contract, {
        foreignKey: "userId",
        as: "contracts",
      });
      User.hasMany(models.CrmCustomer, {
        foreignKey: "userId",
        as: "crmCustomers",
      });
    }
  }
  User.init(
    {
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      email: DataTypes.STRING,
      phone: DataTypes.STRING,
      passwordHash: DataTypes.TEXT,
      role: DataTypes.ENUM("customer", "admin", "seller"),
      createdAt: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        allowNull: false,
        type: DataTypes.DATE,
        defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
      },
    },
    {
      sequelize,
      modelName: "User",
      defaultScope: {
        attributes: { exclude: ["passwordHash", "createdAt", "updatedAt", "role"] },
      },
      scopes: {
        withPassword: {
          attributes: { include: ["passwordHash", "role"] },
        },
      },
    }
  );

  return User;
};
