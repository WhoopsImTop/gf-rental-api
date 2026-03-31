const db = require("../models");
const { getGeoData } = require("../services/geoCoder");

function normalizeString(value) {
  return String(value || "").trim();
}

function toOptionalBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

exports.getAllDeliveryPlaces = async (req, res) => {
  try {
    const places = await db.DeliveryPlace.findAll({
      order: [["name", "ASC"]],
    });
    return res.status(200).json(places);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.createDeliveryPlace = async (req, res) => {
  try {
    const name = normalizeString(req.body.name);
    const street = normalizeString(req.body.street);
    const houseNumber = normalizeString(req.body.houseNumber);
    const postalCode = normalizeString(req.body.postalCode);
    const city = normalizeString(req.body.city);
    const radiusKm = parseFloat(req.body.radiusKm);
    const active = toOptionalBoolean(req.body.active, true);

    if (!name || !street || !houseNumber || !postalCode || !city) {
      return res.status(400).json({
        message: "name, street, houseNumber, postalCode und city sind erforderlich",
      });
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return res.status(400).json({ message: "radiusKm muss > 0 sein" });
    }

    const geo = await getGeoData(
      `${street} ${houseNumber}, ${postalCode} ${city}, Deutschland`
    );
    const lat = parseFloat(geo?.lat);
    const lng = parseFloat(geo?.lon ?? geo?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res
        .status(400)
        .json({ message: "Adresse konnte nicht geokodiert werden" });
    }

    const place = await db.DeliveryPlace.create({
      name,
      street,
      houseNumber,
      postalCode,
      city,
      radiusKm,
      active,
      lat,
      lng,
    });

    return res.status(201).json(place);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.updateDeliveryPlace = async (req, res) => {
  try {
    const place = await db.DeliveryPlace.findByPk(req.params.id);
    if (!place) {
      return res.status(404).json({ message: "Lieferort nicht gefunden" });
    }

    const nextValues = {
      name: req.body.name !== undefined ? normalizeString(req.body.name) : place.name,
      street:
        req.body.street !== undefined
          ? normalizeString(req.body.street)
          : place.street,
      houseNumber:
        req.body.houseNumber !== undefined
          ? normalizeString(req.body.houseNumber)
          : place.houseNumber,
      postalCode:
        req.body.postalCode !== undefined
          ? normalizeString(req.body.postalCode)
          : place.postalCode,
      city: req.body.city !== undefined ? normalizeString(req.body.city) : place.city,
      radiusKm:
        req.body.radiusKm !== undefined ? parseFloat(req.body.radiusKm) : place.radiusKm,
      active:
        req.body.active !== undefined
          ? toOptionalBoolean(req.body.active, place.active)
          : place.active,
    };

    if (!Number.isFinite(parseFloat(nextValues.radiusKm)) || nextValues.radiusKm <= 0) {
      return res.status(400).json({ message: "radiusKm muss > 0 sein" });
    }

    const addressChanged =
      nextValues.street !== place.street ||
      nextValues.houseNumber !== place.houseNumber ||
      nextValues.postalCode !== place.postalCode ||
      nextValues.city !== place.city;

    if (addressChanged) {
      const geo = await getGeoData(
        `${nextValues.street} ${nextValues.houseNumber}, ${nextValues.postalCode} ${nextValues.city}, Deutschland`
      );
      const lat = parseFloat(geo?.lat);
      const lng = parseFloat(geo?.lon ?? geo?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res
          .status(400)
          .json({ message: "Adresse konnte nicht geokodiert werden" });
      }
      nextValues.lat = lat;
      nextValues.lng = lng;
    }

    await place.update(nextValues);
    return res.status(200).json(place);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.deleteDeliveryPlace = async (req, res) => {
  try {
    const place = await db.DeliveryPlace.findByPk(req.params.id);
    if (!place) {
      return res.status(404).json({ message: "Lieferort nicht gefunden" });
    }
    await place.destroy();
    return res.status(200).json({ message: "Lieferort gelöscht" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
