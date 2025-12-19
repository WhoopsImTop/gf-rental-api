"use strict";
const { Model } = require("sequelize");
const { encrypt, decrypt } = require("../services/encryption");
module.exports = (sequelize, DataTypes) => {
  class CustomerDetails extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CustomerDetails.belongsTo(models.User);
    }
  }
  CustomerDetails.init(
    {
      userId: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      birthday: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      street: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue("street", encrypt(value));
        },
        get() {
          const value = this.getDataValue("street");
          return value ? decrypt(value) : null;
        },
      },
      housenumber: {
        type: DataTypes.STRING, // Changed to STRING to support encryption output if numeric type issues arise, but encrypt returns hex string so Text/String is safer
        allowNull: false,
        set(value) {
          this.setDataValue("housenumber", encrypt(String(value)));
        },
        get() {
          const value = this.getDataValue("housenumber");
          return value ? decrypt(value) : null;
        },
      },
      postalCode: {
        type: DataTypes.STRING, // Changed to STRING for encryption
        allowNull: false,
        set(value) {
          this.setDataValue("postalCode", encrypt(String(value)));
        },
        get() {
          const value = this.getDataValue("postalCode");
          return value ? decrypt(value) : null;
        },
      },
      city: { // Added city as it was missing in target content block logic if I select broadly, but let's confirm file content first. File view showed it.
        type: DataTypes.STRING,
        set(value) {
             this.setDataValue("city", encrypt(value));
        },
        get() {
            const value = this.getDataValue("city");
            return value ? decrypt(value) : null;
        }
      },
      country: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
            this.setDataValue("country", encrypt(value));
        },
        get() {
            const value = this.getDataValue("country");
            return value ? decrypt(value) : null;
        }
      },
      newsletter: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      allowsCreditworthyCheck: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      allowedToPurchase: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      acceptPrivacyPolicy: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      driversLicenseNumber: {
        type: DataTypes.TEXT,
        allowNull: false,
        set(value) {
             this.setDataValue("driversLicenseNumber", encrypt(value));
        },
        get() {
            const value = this.getDataValue("driversLicenseNumber");
            return value ? decrypt(value) : null;
        }
      },
      IdCardNumber: {
        type: DataTypes.TEXT,
        allowNull: false,
        set(value) {
             this.setDataValue("IdCardNumber", encrypt(value));
        },
        get() {
            const value = this.getDataValue("IdCardNumber");
            return value ? decrypt(value) : null;
        }
      },
    },
    {
      sequelize,
      modelName: "CustomerDetails",
    }
  );
  return CustomerDetails;
};
