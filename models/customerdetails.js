"use strict";
const { Model } = require("sequelize");
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
      },
      housenumber: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      postalCode: {
        type: DataTypes.NUMBER,
        allowNull: false,
      },
      country: {
        type: DataTypes.STRING,
        allowNull: false,
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
      },
      IdCardNumber: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "CustomerDetails",
    }
  );
  return CustomerDetails;
};
