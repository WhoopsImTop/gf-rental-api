const sequelize = require("sequelize");
const db = require("../models");
const { logger } = require("../services/logging");
const {
  PageBlockValidationError,
  normalizePageBlocks,
} = require("../services/carsharingPageBlocks");

const PUBLIC_STATUSES = ["active", "coming_soon"];
const PUBLIC_CACHE_HEADER = "public, max-age=300";

const EDITABLE_FIELDS = [
  "name",
  "subline",
  "shortDescription",
  "description",
  "equipment",
  "technicalData",
  "weightAndPayload",
  "size",
  "fuel",
  "gear",
  "price",
  "status",
  "availableFrom",
  "comingSoonText",
  "pageEnabled",
  "pageBlocks",
];

const imagesInclude = {
  model: db.Media,
  as: "images",
  through: { attributes: ["order"] },
};

/** MariaDB speichert JSON als LONGTEXT – dort kommt pageBlocks als String zurück. */
function parsePageBlocks(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

/** Gibt das Fahrzeug als JSON zurück, Bilder sortiert nach der Drag&Drop-Reihenfolge. */
function serializeCar(car) {
  const json = car.toJSON();
  json.pageBlocks = parsePageBlocks(json.pageBlocks);
  json.pageEnabled = Boolean(json.pageEnabled);
  json.images = (json.images || [])
    .map((image) => {
      const { CarsharingCarsImages: link, ...media } = image;
      return { ...media, order: link?.order ?? 0 };
    })
    .sort((a, b) => a.order - b.order || a.id - b.id);
  return json;
}

function pickEditableFields(body) {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = body[field];
    }
  }
  if ("pageBlocks" in data) {
    data.pageBlocks = normalizePageBlocks(data.pageBlocks);
  }
  if ("availableFrom" in data && !data.availableFrom) {
    data.availableFrom = null;
  }
  if ("pageEnabled" in data) {
    data.pageEnabled = data.pageEnabled === true || data.pageEnabled === "true";
  }
  return data;
}

async function setOrderedImages(car, imageIds) {
  await car.setImages([]);
  if (!Array.isArray(imageIds) || imageIds.length === 0) return;

  const medias = await db.Media.findAll({
    where: { id: { [sequelize.Op.in]: imageIds } },
  });
  const mediaById = new Map(medias.map((media) => [media.id, media]));
  for (let i = 0; i < imageIds.length; i++) {
    const media = mediaById.get(Number(imageIds[i]));
    if (media) {
      await car.addImage(media, { through: { order: i } });
    }
  }
}

function handleWriteError(res, error, context) {
  if (error instanceof PageBlockValidationError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof sequelize.ValidationError || error instanceof sequelize.DatabaseError) {
    logger("error", `[${context}] ${error.message}`);
    return res.status(400).json({ error: "Ungültige Fahrzeugdaten" });
  }
  logger("error", `[${context}] ${error.message}`);
  return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
}

async function findCarWithImages(where) {
  const car = await db.CarsharingCar.findOne({ where, include: [imagesInclude] });
  return car ? serializeCar(car) : null;
}

/**
 * Bereitet die Fahrzeugseite für die öffentliche Ausgabe auf: Ist die Seite
 * deaktiviert, wird eine leere Blockliste geliefert. Bildblöcke bekommen die
 * aktuelle URL aus der Mediathek; Blöcke mit gelöschtem Bild entfallen.
 */
async function withPublicPageBlocks(cars) {
  const blocksOf = (car) =>
    car.pageEnabled && Array.isArray(car.pageBlocks) ? car.pageBlocks : [];

  const mediaIds = cars.flatMap((car) =>
    blocksOf(car)
      .filter((block) => block.type === "image")
      .map((block) => block.mediaId),
  );
  const medias = mediaIds.length
    ? await db.Media.findAll({ where: { id: { [sequelize.Op.in]: mediaIds } } })
    : [];
  const mediaById = new Map(medias.map((media) => [media.id, media]));

  return cars.map((car) => ({
    ...car,
    pageBlocks: blocksOf(car)
      .map((block) => {
        if (block.type !== "image") return block;
        const media = mediaById.get(block.mediaId);
        return media ? { ...block, url: media.url } : null;
      })
      .filter(Boolean),
  }));
}

exports.createCarsharingCar = async (req, res) => {
  try {
    const carsharingCar = await db.CarsharingCar.create(pickEditableFields(req.body));
    await setOrderedImages(carsharingCar, req.body.images);

    return res.status(201).json(await findCarWithImages({ id: carsharingCar.id }));
  } catch (error) {
    return handleWriteError(res, error, "createCarsharingCar");
  }
};

exports.findAllCarsharingCars = async (req, res) => {
  try {
    const statuses = PUBLIC_STATUSES.includes(req.query.status)
      ? [req.query.status]
      : PUBLIC_STATUSES;
    const carsharingCars = await db.CarsharingCar.findAll({
      where: { status: statuses },
      include: [imagesInclude],
      order: [["id", "ASC"]],
    });
    res.setHeader("Cache-Control", PUBLIC_CACHE_HEADER);
    return res
      .status(200)
      .json(await withPublicPageBlocks(carsharingCars.map(serializeCar)));
  } catch (error) {
    logger("error", `[findAllCarsharingCars] ${error.message}`);
    return res.status(500).send({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.findAllCarsharingCarsAdmin = async (req, res) => {
  try {
    const carsharingCars = await db.CarsharingCar.findAll({
      include: [imagesInclude],
      order: [["id", "ASC"]],
    });
    return res.status(200).json(carsharingCars.map(serializeCar));
  } catch (error) {
    logger("error", `[findAllCarsharingCarsAdmin] ${error.message}`);
    return res.status(500).send({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.findOneCarsharingCar = async (req, res) => {
  try {
    const carsharingCar = await findCarWithImages({
      id: req.params.id,
      status: PUBLIC_STATUSES,
    });
    if (!carsharingCar) {
      return res
        .status(404)
        .send("CarsharingCar with the specified ID does not exist");
    }
    const [publicCar] = await withPublicPageBlocks([carsharingCar]);
    res.setHeader("Cache-Control", PUBLIC_CACHE_HEADER);
    return res.status(200).json(publicCar);
  } catch (error) {
    logger("error", `[findOneCarsharingCar] ${error.message}`);
    return res.status(500).send({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.updateCarsharingCar = async (req, res) => {
  try {
    const { id } = req.params;
    const carsharingCar = await db.CarsharingCar.findByPk(id);
    if (!carsharingCar) {
      return res.status(404).json({ error: "CarsharingCar not found" });
    }

    await carsharingCar.update(pickEditableFields(req.body));
    if (Object.prototype.hasOwnProperty.call(req.body, "images")) {
      await setOrderedImages(carsharingCar, req.body.images);
    }

    return res.status(200).json(await findCarWithImages({ id }));
  } catch (error) {
    return handleWriteError(res, error, "updateCarsharingCar");
  }
};

exports.deleteCarsharingCar = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.CarsharingCar.destroy({
      where: { id: id },
    });
    if (deleted) {
      return res.status(204).send("CarsharingCar deleted");
    } else {
      throw new Error("CarsharingCar not found");
    }
  } catch (error) {
    return res.status(500).send({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.addImageToCarsharingCar = async (req, res) => {
  try {
    const { carId, mediaId } = req.body;

    // Check if car exists
    const car = await db.CarsharingCar.findByPk(carId);
    if (!car) {
      return res.status(404).json({ error: "CarsharingCar not found" });
    }

    // Check if media exists
    const media = await db.Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    // Add association
    await car.addImages(media);

    return res
      .status(200)
      .json({ message: "Image added to CarsharingCar successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.removeImageFromCarsharingCar = async (req, res) => {
  try {
    const { carId, mediaId } = req.params;

    // Check if car exists
    const car = await db.CarsharingCar.findByPk(carId);
    if (!car) {
      return res.status(404).json({ error: "CarsharingCar not found" });
    }

    // Check if media exists
    const media = await db.Media.findByPk(mediaId);
    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    // Remove association
    await car.removeImages(media);

    return res
      .status(200)
      .json({ message: "Image removed from CarsharingCar successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};
