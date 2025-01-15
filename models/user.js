"use strict";
const { Model } = require("sequelize");
const { encrypt, decrypt } = require("../services/encryption");
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
      User.belongsToMany(models.CrmCustomer, {
        through: "UserCrmCustomers",
        foreignKey: "userId",
        otherKey: "crmCustomerId",
      });
    }
  }
  User.init(
    {
      firstName: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue("firstName", encrypt(value));
        },
        get() {
          const value = this.getDataValue("firstName");
          return value ? decrypt(value) : null;
        },
      },
      lastName: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue("lastName", encrypt(value));
        },
        get() {
          const value = this.getDataValue("lastName");
          return value ? decrypt(value) : null;
        },
      },
      emailHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue("email", encrypt(value));
        },
        get() {
          const value = this.getDataValue("email");
          return value ? decrypt(value) : null;
        },
      },
      phone: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue("phone", encrypt(value));
        },
        get() {
          const value = this.getDataValue("phone");
          return value ? decrypt(value) : null;
        },
      },
      passwordHash: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
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
        attributes: {
          exclude: ["passwordHash", "createdAt", "updatedAt", "role"],
        },
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
