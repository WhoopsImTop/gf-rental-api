const fs = require("fs");
const path = require("path");

module.exports = (sequelize, DataTypes, db) => {
  const feedbackDir = __dirname;

  fs.readdirSync(feedbackDir)
    .filter((file) => file.endsWith(".js") && file !== "index.js")
    .forEach((file) => {
      const model = require(path.join(feedbackDir, file))(sequelize, DataTypes);
      db[model.name] = model;
    });
};
