"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CarAboFolders", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      name: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      sortOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // Eigene Zuordnungstabelle statt Spalte an CarAbos: Ordner sind reine
    // CRM-Organisation und dürfen nie in öffentlichen Auto-Abo-Antworten landen.
    await queryInterface.createTable("CarAboFolderAssignments", {
      carAboId: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.INTEGER,
        references: { model: "CarAbos", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      folderId: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: "CarAboFolders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex("CarAboFolderAssignments", ["folderId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("CarAboFolderAssignments");
    await queryInterface.dropTable("CarAboFolders");
  },
};
