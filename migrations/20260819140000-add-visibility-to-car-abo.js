"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CarAbos", "visibility", {
      type: Sequelize.ENUM("public", "private"),
      allowNull: false,
      defaultValue: "public",
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("CarAbos", "visibility");
  },
};

