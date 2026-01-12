"use strict";

const path = require("path");
const fs = require("fs");

module.exports = {
  async up(queryInterface, Sequelize) {
    const filePath = path.join(__dirname, "files", "postleitzahlen.json");
    const rawData = fs.readFileSync(filePath, "utf8");
    const jsonData = JSON.parse(rawData);

    const data = jsonData.map(item => ({
      id: Number(item.id),
      ziel: item.Ziel,
      zielort: item.Zielort,
      luftlinie: item.Luftlinie,
      fahrstrecke: item.Fahrstrecke,
      fahrzeit: item.Fahrzeit,
      lieferkosten: Number(item.Lieferkosten)
    }));

    await queryInterface.bulkInsert("Postleitzahlen", data);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("Postleitzahlen", null, {});
  },
};
