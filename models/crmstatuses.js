"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CrmStatuses extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CrmStatuses.belongsToMany(models.CrmCustomer, {
        through: "CrmCustomerCrmStatuses",
        foreignKey: "crmStatusId",
        otherKey: "crmCustomerId",
      });
      CrmStatuses.hasOne(models.Media, {
        foreignKey: "statusId", // Spalte in der Media-Tabelle
        sourceKey: "id", // Spalte in der CrmStatuses-Tabelle
        as: "media",
      });
    }
  }
  CrmStatuses.init(
    {
      name: DataTypes.STRING,
      iconName: DataTypes.STRING,
      description: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: "CrmStatuses",
    }
  );
  return CrmStatuses;
};
