"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  // Ein Fahrzeug liegt in höchstens einem Ordner (carAboId ist Primärschlüssel).
  class CarAboFolderAssignment extends Model {
    static associate(models) {
      CarAboFolderAssignment.belongsTo(models.CarAboFolder, {
        foreignKey: "folderId",
        as: "folder",
      });
      CarAboFolderAssignment.belongsTo(models.CarAbo, {
        foreignKey: "carAboId",
        as: "carAbo",
      });
    }
  }

  CarAboFolderAssignment.init(
    {
      carAboId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      folderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "CarAboFolderAssignment",
      tableName: "CarAboFolderAssignments",
      timestamps: true,
    }
  );

  return CarAboFolderAssignment;
};
