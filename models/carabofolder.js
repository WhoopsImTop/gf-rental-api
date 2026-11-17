"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class CarAboFolder extends Model {
    static associate(models) {
      CarAboFolder.hasMany(models.CarAboFolderAssignment, {
        foreignKey: "folderId",
        as: "assignments",
        onDelete: "CASCADE",
      });
    }
  }

  CarAboFolder.init(
    {
      name: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: "CarAboFolder",
      tableName: "CarAboFolders",
      timestamps: true,
    }
  );

  return CarAboFolder;
};
