const db = require("../models");
const { getGeoData } = require("../services/geoCoder");
const { getDrivingRouteMetrics } = require("../services/routing");

const EARTH_RADIUS_KM = 6371;

function toNumber(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

async function getPricePerKm() {
  const setting = await db.Setting.findOne({
    attributes: ["pricePerKm"],
  });
  const pricePerKm = toNumber(setting?.pricePerKm);
  return pricePerKm ?? 0;
}

async function geocodeByPlz(plz) {
  // Keine Ländervorgabe, damit auch ausländische PLZ (FR/CH) geokodiert werden können
  // und wir danach sauber mit `country_code` auf DE einschränken.
  const geoData = await getGeoData(String(plz));
  console.log(geoData);

  // Geoapify liefert i.d.R. country_code zurück (z.B. "DE").
  // Wir liefern nur innerhalb Deutschlands, daher validieren wir das Ziel.
  const countryCode =
    geoData?.country_code ||
    geoData?.countryCode ||
    geoData?.countrycode ||
    null;
  if (
    countryCode &&
    String(countryCode).toUpperCase() !== "DE"
  ) {
    throw new Error("GEO_TARGET_NOT_IN_DE");
  }

  const lat = toNumber(geoData?.lat);
  const lng = toNumber(geoData?.lon ?? geoData?.lng);

  if (lat === null || lng === null) {
    throw new Error("GEO_TARGET_INVALID");
  }

  return { lat, lng };
}

exports.getAllPlz = async (req, res) => {
  try {
    let plz = await db.Postleitzahlen.findAll();
    res.status(201).json(plz);
  } catch (error) {
    res.status(500).json({ error: "Fehler beim Laden…" });
  }
};

exports.getDeliveryCostByPlz = async (req, res) => {
  try {
    const { plz } = req.params;
    const normalizedPlz = String(plz || "").trim();

    // DE-PLZ sind 5-stellig, aber wir akzeptieren 4-stellig (z.B. CH),
    // damit der Nutzer eine saubere "nur DE"-Antwort bekommt.
    if (!/^\d{4,5}$/.test(normalizedPlz)) {
      return res.status(400).json({
        message: "Ungültige PLZ",
        code: "INVALID_POSTAL_CODE",
      });
    }

    const target = await geocodeByPlz(normalizedPlz);
    const activePlaces = await db.DeliveryPlace.findAll({
      where: { active: true },
    });

    if (!activePlaces.length) {
      return res.status(404).json({
        message: "Keine aktiven Lieferorte konfiguriert",
        code: "NO_DELIVERY_PLACES",
      });
    }

    const candidates = activePlaces
      .map((place) => {
        const placeLat = toNumber(place.lat);
        const placeLng = toNumber(place.lng);
        const radiusKm = toNumber(place.radiusKm);
        if (
          placeLat === null ||
          placeLng === null ||
          radiusKm === null ||
          radiusKm <= 0
        ) {
          return null;
        }

        const airDistanceKm = haversineDistanceKm(
          placeLat,
          placeLng,
          target.lat,
          target.lng
        );

        return {
          place,
          placeLat,
          placeLng,
          radiusKm,
          airDistanceKm,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.airDistanceKm - b.airDistanceKm);

    const matchingCandidate = candidates.find(
      (candidate) => candidate.airDistanceKm <= candidate.radiusKm
    );

    if (!matchingCandidate) {
      return res.status(422).json({
        message: "Adresse außerhalb des Liefergebiets",
        code: "OUTSIDE_DELIVERY_RADIUS",
        isDeliverable: false,
      });
    }

    const route = await getDrivingRouteMetrics(
      matchingCandidate.placeLat,
      matchingCandidate.placeLng,
      target.lat,
      target.lng
    );

    const pricePerKm = await getPricePerKm();
    const deliveryCost = Number((route.distanceKm * pricePerKm).toFixed(2));

    res.json({
      plz: normalizedPlz,
      lieferkosten: deliveryCost < 80 ? 80 : deliveryCost,
      fahrstrecke: Number(route.distanceKm.toFixed(2)),
      distanceKm: Number(route.distanceKm.toFixed(2)),
      durationMin: route.durationMin
        ? Number(route.durationMin.toFixed(1))
        : null,
      pricePerKm,
      deliveryPlace: {
        id: matchingCandidate.place.id,
        name: matchingCandidate.place.name,
        radiusKm: Number(matchingCandidate.radiusKm.toFixed(2)),
      },
      isDeliverable: true,
    });
  } catch (err) {
    console.error(err);
    if (String(err.message).includes("GEO_TARGET_NOT_IN_DE")) {
      return res.status(422).json({
        message: "Wir liefern nur innerhalb Deutschlands.",
        code: "OUTSIDE_GERMANY",
        isDeliverable: false,
      });
    }
    if (String(err.message).includes("No data found")) {
      return res.status(404).json({
        message: "PLZ konnte nicht geokodiert werden",
        code: "GEO_TARGET_NOT_FOUND",
      });
    }
    res.status(500).json({ message: "Server error", code: "DELIVERY_CALC_FAILED" });
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
