"use strict";
const { Model } = require("sequelize");
const { encrypt, isEncrypted, decrypt } = require("../services/encryption");
module.exports = (sequelize, DataTypes) => {
  class CrmCustomer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CrmCustomer.hasMany(models.CrmActionHistory, {
        as: "actionHistory",
      });
      CrmCustomer.belongsTo(models.CrmStatuses, {
        foreignKey: "statusId",
        as: 'status'
      });
      CrmCustomer.belongsToMany(models.User, {
        as: "users",
        through: "UserCrmCustomers",
        foreignKey: "crmCustomerId",
        otherKey: "userId",
      });
    }
  }
  CrmCustomer.init(
    {
      statusId: DataTypes.INTEGER,
      salutation: DataTypes.ENUM("Herr", "Frau", "Divers", "Keine Angabe"),
      firstName: DataTypes.TEXT,
      lastName: DataTypes.TEXT,
      companyName: DataTypes.TEXT,
      customerType: DataTypes.ENUM(
        "Privatkunde",
        "Firmenkunde",
        "Interessent",
        "Import"
      ),
      priority: DataTypes.ENUM("low", "medium", "high"),
      sellingStrategy: DataTypes.ENUM(
        "Offen",
        "Bestandskundenentwicklung",
        "Bestandskundenpfelge",
        "Key-Account"
      ),
      email: DataTypes.TEXT,
      altEmail: DataTypes.TEXT,
      phone: DataTypes.TEXT,
      altPhone: DataTypes.TEXT,
      website: DataTypes.TEXT,
      street: DataTypes.TEXT,
      houseNumber: DataTypes.TEXT,
      postalCode: DataTypes.TEXT,
      city: DataTypes.TEXT,
      country: DataTypes.TEXT,
      lat: DataTypes.DECIMAL(10, 8),
      lng: DataTypes.DECIMAL(11, 8),
      callBackDate: DataTypes.DATE,
      callBackTime: DataTypes.STRING,
      preferredContactMethod: DataTypes.ENUM(
        "Telefon",
        "Email",
        "Post",
        "WhatsApp",
        "SMS"
      ),
      marketingOptIn: DataTypes.BOOLEAN,
      marketingOptInDate: DataTypes.STRING,
      notes: DataTypes.TEXT,
      userId: DataTypes.INTEGER,
      deletedAt: DataTypes.DATE,
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "CrmCustomer",
    }
  );

  const excryptedFields = [
    "firstName",
    "lastName",
    "email",
    "altEmail",
    "phone",
    "altPhone",
    "website",
    "street",
    "houseNumber",
    "postalCode",
    "city",
    "country",
    "notes",
  ];

  CrmCustomer.beforeCreate((crmCustomer, options) => {
    excryptedFields.forEach((field) => {
      if (crmCustomer.dataValues[field] && !isEncrypted(crmCustomer[field])) {
        crmCustomer.dataValues[field] = encrypt(crmCustomer.dataValues[field]);
      }
    });
  });

  CrmCustomer.beforeBulkUpdate((crmCustomer, options) => {
    excryptedFields.forEach((field) => {
      if (crmCustomer.attributes[field] && !isEncrypted(crmCustomer[field])) {
        crmCustomer.attributes[field] = encrypt(crmCustomer.attributes[field]);
      }
    });
  });

  CrmCustomer.afterFind((crmCustomer, options) => {
    if (crmCustomer) {
      if (Array.isArray(crmCustomer)) {
        console.log("crmCustomer", crmCustomer);
        crmCustomer.forEach((record) => {
          excryptedFields.forEach((field) => {
            if (record[field] && isEncrypted(record[field])) {
              record[field] = decrypt(record[field]);
            }
          });
        });
      } else {
        excryptedFields.forEach((field) => {
          if (
            crmCustomer.dataValues[field] &&
            isEncrypted(crmCustomer[field])
          ) {
            crmCustomer.dataValues[field] = decrypt(
              crmCustomer.dataValues[field]
            );
          }
        });
      }
    }
  });

  return CrmCustomer;
};
