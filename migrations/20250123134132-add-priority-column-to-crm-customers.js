"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("CrmCustomers", "priority", {
      type: Sequelize.ENUM("low", "medium", "high"),
      defaultValue: "low",
    });
    await queryInterface.addColumn("CrmCustomers", "sellingStrategy", {
      type: Sequelize.ENUM(
        "Offen",
        "Bestandskundenentwicklung",
        "Bestandskundenpfelge",
        "Key-Account"
      ),
      defaultValue: "Offen",
    });
  },
};
