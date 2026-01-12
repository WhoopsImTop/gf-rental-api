const { Op } = require("sequelize");
const db = require("../models");

exports.getDeliveryCostByPlz = async (req, res) => {
  try {
    const { plz } = req.params;

    // 1️⃣ Exakte PLZ suchen
    let entry = await db.Postleitzahlen.findOne({
      where: { Ziel: plz },
    });

    // 2️⃣ Falls nicht gefunden → nächste PLZ suchen
    if (!entry) {
      entry = await db.Postleitzahlen.findOne({
        order: [[db.sequelize.literal(`ABS(Ziel - ${plz})`), "ASC"]],
      });
    }

    if (!entry) {
      return res.status(404).json({ message: "Keine Daten gefunden" });
    }

    res.json({
      plz: entry.Ziel,
      zielort: entry.Zielort,
      lieferkosten: entry.Lieferkosten,
      fahrstrecke: entry.Fahrstrecke,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.recalculateDeliveryCosts = async (req, res) => {
  try {
    let { centProKm } = req.body;

    // 1️⃣ Float aus Input
    centProKm = parseFloat(centProKm);
    if (isNaN(centProKm) || centProKm <= 0) {
      return res.status(400).json({
        message: "centProKm muss eine positive Zahl sein",
      });
    }

    // 2️⃣ Alle Rows holen
    const rows = await db.Postleitzahlen.findAll();

    for (const row of rows) {
      // 2a. Fahrstrecke sauber konvertieren
      let km = row.Fahrstrecke.replace(",", ".").trim();
      let fahrstreckeNum = parseFloat(km);

      if (isNaN(fahrstreckeNum)) {
        fahrstreckeNum = 0; // falls doch noch ein ungültiger Wert
      }

      // 2b. Kosten berechnen und auf nächste ganze Zahl runden
      const kosten = Math.round(fahrstreckeNum * centProKm);

      // 2c. Update in DB
      await row.update({ Lieferkosten: kosten });
    }

    res.json({
      message: "Lieferkosten erfolgreich neu berechnet",
      centProKm,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
