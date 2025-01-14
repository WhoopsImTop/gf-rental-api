"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Contract extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Contract.belongsTo(models.User);
      Contract.hasOne(models.CarAbo);
    }
  }
  Contract.init(
    {
      differentDeliveryAdress: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      deliveryStreet: {
        type: DataTypes.TEXT,
      },
      deliveryHousenumber: {
        type: DataTypes.INTEGER,
      },
      deliveryPostalCode: {
        type: DataTypes.INTEGER,
      },
      deliveryCountry: {
        type: DataTypes.TEXT,
      },
      deliveryNote: {
        type: DataTypes.TEXT,
      },
      wantsDelivery: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      deliveryCosts: {
        type: DataTypes.DECIMAL,
      },
      startingDate: {
        type: DataTypes.DATE,
      },
      duration: {
        type: DataTypes.INTEGER,
      },
      monthlyPrice: {
        type: DataTypes.DECIMAL,
      },
      totalCost: {
        type: DataTypes.DECIMAL,
      },
      insurancePackage: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      insuranceCosts: {
        type: DataTypes.DECIMAL,
      },
      familyAndFriends: {
        type: DataTypes.BOOLEAN,
      },
      familyAndFriendsCosts: {
        type: DataTypes.DECIMAL,
      },
      familyAndFriendsMembers: {
        type: DataTypes.JSON,
      },
      userId: {
        type: DataTypes.INTEGER,
      },
      oderStatus: {
        type: DataTypes.ENUM("started", "completed", "rejected"),
      },
      orderCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      completedBy: {
        type: DataTypes.INTEGER,
      },
      archived: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      contractFile: {
        type: DataTypes.STRING,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: "Contract",
    }
  );
  return Contract;
};
