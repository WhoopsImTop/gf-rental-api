"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Carts", "customerType", {
      type: Sequelize.ENUM("private", "business"),
      allowNull: false,
      defaultValue: "private",
    });

    await queryInterface.addColumn("Contracts", "customerType", {
      type: Sequelize.ENUM("private", "business"),
      allowNull: false,
      defaultValue: "private",
    });

    const nullablePersonalFields = [
      "birthday",
      "placeOfBirth",
      "driversLicenseNumber",
      "IdCardNumber",
      "allowedLicenseClasses",
      "licenseValidUntil",
      "licenseIssuingPlace",
      "licenseIssuedOn",
    ];

    for (const field of nullablePersonalFields) {
      await queryInterface.changeColumn("CustomerDetails", field, {
        type:
          field === "birthday" || field === "licenseValidUntil" || field === "licenseIssuedOn"
            ? Sequelize.DATE
            : Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Carts", "customerType");
    await queryInterface.removeColumn("Contracts", "customerType");

    const nonNullablePersonalFields = [
      { name: "birthday", type: "DATE" },
      { name: "placeOfBirth", type: "TEXT" },
      { name: "driversLicenseNumber", type: "TEXT" },
      { name: "IdCardNumber", type: "TEXT" },
      { name: "allowedLicenseClasses", type: "TEXT" },
      { name: "licenseValidUntil", type: "DATE" },
      { name: "licenseIssuingPlace", type: "TEXT" },
      { name: "licenseIssuedOn", type: "DATE" },
    ];

    for (const field of nonNullablePersonalFields) {
      await queryInterface.changeColumn("CustomerDetails", field.name, {
        type: Sequelize[field.type],
        allowNull: false,
      });
    }
  },
};
