"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CrmActionHistory extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CrmActionHistory.belongsTo(models.CrmCustomer, {
        foreignKey: "crmCustomerId",
      });
    }
  }
  CrmActionHistory.init(
    {
      crmCustomerId: DataTypes.INTEGER,
      action: DataTypes.ENUM(
        "Anruf",
        "E-Mail",
        "Brief",
        "Änderung",
        "Löschung"
      ),
      title: DataTypes.STRING,
      comment: DataTypes.TEXT,
      userId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "CrmActionHistory",
    }
  );
  return CrmActionHistory;
};
