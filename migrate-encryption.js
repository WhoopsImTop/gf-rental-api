/**
 * Sequelize DB Encryption Migration Script (mit Dry Run)
 *
 * - Alte CBC-Daten via old_encryption.js entschlüsseln
 * - Neu AES-256-GCM verschlüsseln
 * - Tabellen/Models: Users, CrmCustomers, Reviews
 * - Dry Run Modus loggt nur, schreibt nichts
 */

require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");
const oldEnc = require("./services/old_encryption");
const newEnc = require("./services/encryption");

// -------------------
// CONFIG
// -------------------
const DRY_RUN = true;

// Sequelize Verbindung
const sequelize = new Sequelize(
  process.env.DBNAME,
  process.env.DBUSER,
  process.env.DBPASS,
  {
    host: process.env.DBHOST,
    dialect: process.env.DB_DIALECT || "mysql",
    logging: false,
  }
);

// -------------------
// Models definieren (nur die verschlüsselten Spalten)
// -------------------
const CrmCustomers = sequelize.define(
  "CrmCustomers",
  {
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    website: DataTypes.STRING,
    street: DataTypes.STRING,
    houseNumber: DataTypes.STRING,
    postalCode: DataTypes.STRING,
    city: DataTypes.STRING,
    notes: DataTypes.TEXT,
  },
  { tableName: "CrmCustomers", timestamps: false }
);

const Reviews = sequelize.define(
  "Reviews",
  {
    email: DataTypes.STRING,
  },
  { tableName: "Reviews", timestamps: false }
);

const Users = sequelize.define(
  "Users",
  {
    firstName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
  },
  { tableName: "Users", timestamps: false }
);

// -------------------
// Felder pro Model
// -------------------
const ENCRYPTED_FIELDS = {
  CrmCustomers: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "website",
    "street",
    "houseNumber",
    "postalCode",
    "city",
    "notes",
  ],
  Reviews: ["email"],
  Users: ["firstName", "lastName", "email", "phone"],
};

// -------------------
// Migration-Funktion
// -------------------
async function migrateEncryption() {
  try {
    await sequelize.authenticate();
    console.log(`Sequelize verbunden. Dry Run: ${DRY_RUN}\n`);

    for (const [modelName, fields] of Object.entries(ENCRYPTED_FIELDS)) {
      const model = sequelize.models[modelName];
      console.log(`\nVerarbeite Model: ${modelName}`);

      const rows = await model.findAll();
      for (const row of rows) {
        for (const field of fields) {
          const oldValue = row.get(field);
          if (!oldValue) continue;

          try {
            // 1. Alte Daten entschlüsseln
            const decrypted = oldEnc.old_decrypt(oldValue);

            // 2. Neu verschlüsseln
            const reEncrypted = newEnc.encrypt(decrypted);

            if (DRY_RUN) {
              console.log(
                `ID ${row.id}, Feld ${field}: würde migriert\n  Alt: ${oldValue}\n  Neu: ${reEncrypted}`
              );
            } else {
            }
          } catch (err) {
            console.error(
              `ID ${row.id}, Feld ${field}: Fehler bei Migration (${err.message})`
            );
          }
        }

        if (!DRY_RUN) {
          console.log(`ID ${row.id}: erfolgreich gespeichert`);
        }
      }
    }

    console.log("\n✅ Migration abgeschlossen!");
    await sequelize.close();
  } catch (err) {
    console.error("Migration fehlgeschlagen:", err);
    await sequelize.close();
  }
}

// -------------------
// Script ausführen
// -------------------
migrateEncryption();
