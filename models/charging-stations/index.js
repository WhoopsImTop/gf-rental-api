const fs = require("fs");
const path = require("path");

// Lädt die Ladesäulen-Cache-Modelle (Operator, Location, Evse, SyncState) in db.
module.exports = (sequelize, DataTypes, db) => {
  fs.readdirSync(__dirname)
    .filter((file) => file.endsWith(".js") && file !== "index.js")
    .forEach((file) => {
      const model = require(path.join(__dirname, file))(sequelize, DataTypes);
      db[model.name] = model;
    });
};
