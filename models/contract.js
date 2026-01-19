"use strict";
const { Model } = require("sequelize");
const { encrypt, decrypt } = require("../services/encryption");
module.exports = (sequelize, DataTypes) => {
  class Contract extends Model {
    static associate(models) {
      Contract.belongsTo(models.User);
      Contract.belongsTo(models.CarAbo, {
        foreignKey: "carAboId",
        as: "carAbo",
      });
      Contract.belongsTo(models.CarAboColor, {
        foreignKey: "colorId",
        as: "color",
      });
      Contract.belongsTo(models.CarAboPrice, {
        foreignKey: "priceId",
        as: "price",
      });
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
        set(value) {
          this.setDataValue("deliveryStreet", encrypt(value));
        },
        get() {
          const value = this.getDataValue("deliveryStreet");
          return value ? decrypt(value) : null;
        },
      },
      deliveryHousenumber: {
        type: DataTypes.INTEGER,
        set(value) {
          this.setDataValue("deliveryHousenumber", encrypt(value));
        },
        get() {
          const value = this.getDataValue("deliveryHousenumber");
          return value ? decrypt(value) : null;
        },
      },
      deliveryPostalCode: {
        type: DataTypes.INTEGER,
        set(value) {
          this.setDataValue("deliveryPostalCode", encrypt(value));
        },
        get() {
          const value = this.getDataValue("deliveryPostalCode");
          return value ? decrypt(value) : null;
        },
      },
      deliveryCountry: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("deliveryCountry", encrypt(value));
        },
        get() {
          const value = this.getDataValue("deliveryCountry");
          return value ? decrypt(value) : null;
        },
      },
      deliveryNote: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("deliveryNote", encrypt(value));
        },
        get() {
          const value = this.getDataValue("deliveryNote");
          return value ? decrypt(value) : null;
        },
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
        type: DataTypes.TEXT,
        set(value) {
          // value ist JS-Objekt oder Array
          const stringified = JSON.stringify(value);
          this.setDataValue("familyAndFriendsMembers", encrypt(stringified));
        },
        get() {
          const value = this.getDataValue("familyAndFriendsMembers");
          if (!value) return null;

          try {
            const decrypted = decrypt(value); // zuerst entschlüsseln
            return JSON.parse(decrypted); // dann in Objekt zurückwandeln
          } catch (err) {
            console.error("Failed to decrypt familyAndFriendsMembers:", err);
            return null;
          }
        },
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
      accountHolderName: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("accountHolderName", encrypt(value));
        },
        get() {
          const value = this.getDataValue("accountHolderName");
          return value ? decrypt(value) : null;
        },
      },
      iban: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("iban", encrypt(value));
        },
        get() {
          const value = this.getDataValue("iban");
          return value ? decrypt(value) : null;
        },
      },
      sepaMandate: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      sepaMandateDate: {
        type: DataTypes.DATE,
      },
      score: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("score", encrypt(value));
        },
        get() {
          const value = this.getDataValue("score");
          return value ? decrypt(value) : null;
        },
      },
      carAboId: {
        type: DataTypes.INTEGER,
      },
      colorId: {
        type: DataTypes.INTEGER,
      },
      priceId: {
        type: DataTypes.INTEGER,
      },
      withDeposit: {
        type: DataTypes.BOOLEAN,
      },
      lat: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("lat", encrypt(value));
        },
        get() {
          const value = this.getDataValue("lat");
          return value ? decrypt(value) : null;
        },
      },
      lng: {
        type: DataTypes.TEXT,
        set(value) {
          this.setDataValue("lng", encrypt(value));
        },
        get() {
          const value = this.getDataValue("lng");
          return value ? decrypt(value) : null;
        },
      },
      pickupLocationName: { type: DataTypes.STRING },
      pickupLocationLat: { type: DataTypes.TEXT },
      pickupLocationLng: { type: DataTypes.TEXT },
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
    },
  );
  return Contract;
};
