"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("CarAboMedia", {
      carAboId: {
        type: Sequelize.INTEGER,
        references: {
          model: "CarAbos",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      mediaId: {
        type: Sequelize.INTEGER,
        references: {
          model: "Media",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("CarAboMedia");
  },
};
