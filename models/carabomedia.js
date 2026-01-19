"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class CarAboMedia extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      CarAboMedia.belongsTo(models.CarAbo, {
        foreignKey: "carAboId",
        as: "carAbo",
      });
      CarAboMedia.belongsTo(models.Media, {
        foreignKey: "mediaId",
        as: "media",
      });
    }
  }
  CarAboMedia.init(
    {
      carAboId: DataTypes.INTEGER,
      mediaId: DataTypes.INTEGER,
      type: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Type of media: interior, exterior, etc.",
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: "CarAboMedia",
      tableName: "CarAboMedia",
    },
  );
  return CarAboMedia;
};
