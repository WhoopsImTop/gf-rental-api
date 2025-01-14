"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Media extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Media.belongsToMany(models.CarAbo, {
        through: "MediaCrmCarAbos",
        foreignKey: "mediaId",
        otherKey: "carAboId",
      });
      Media.belongsToMany(models.CrmStatuses, {
        through: "MediaCrmStatuses",
        foreignKey: "mediaId",
        otherKey: "crmStatusId",
      });
    }
  }
  Media.init(
    {
      name: DataTypes.STRING,
      fileSize: DataTypes.INTEGER,
      fileType: DataTypes.STRING,
      url: DataTypes.STRING,
      statusId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "Media",
    }
  );
  return Media;
};
