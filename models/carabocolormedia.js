'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CarAboColorMedia extends Model {
    static associate(models) {
      CarAboColorMedia.belongsTo(models.CarAboColor, {
        foreignKey: 'carAboColorId',
        as: 'carAboColor',
      });
      CarAboColorMedia.belongsTo(models.Media, {
        foreignKey: 'mediaId',
        as: 'media',
      });
    }
  }

  CarAboColorMedia.init(
    {
      carAboColorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      mediaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'CarAboColorMedia',
      tableName: 'CarAboColorMedia',
    }
  );

  return CarAboColorMedia;
};
