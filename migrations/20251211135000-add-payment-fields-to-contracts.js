"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Contracts", "accountHolderName", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("Contracts", "iban", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("Contracts", "sepaMandate", {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });

    await queryInterface.addColumn("Contracts", "sepaMandateDate", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("Contracts", "score", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Contracts", "accountHolderName");
    await queryInterface.removeColumn("Contracts", "iban");
    await queryInterface.removeColumn("Contracts", "sepaMandate");
    await queryInterface.removeColumn("Contracts", "sepaMandateDate");
    await queryInterface.removeColumn("Contracts", "score");
  },
};
