const db = require("../models");
const { logger } = require("../services/logging");

const MAX_NAME_LENGTH = 80;
const MAX_MOVE_BATCH = 500;

const normalizeName = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const validateName = (value) => {
  const name = normalizeName(value);
  if (!name) return { error: "Bitte gib einen Ordnernamen ein." };
  if (name.length > MAX_NAME_LENGTH) {
    return {
      error: `Der Ordnername darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`,
    };
  }
  return { name };
};

const parsePositiveInt = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
};

/** Prüft die Liste der zu verschiebenden Fahrzeuge; doppelte IDs werden entfernt. */
const parseCarAboIds = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Bitte wähle mindestens ein Fahrzeug aus." };
  }
  if (value.length > MAX_MOVE_BATCH) {
    return {
      error: `Es können höchstens ${MAX_MOVE_BATCH} Fahrzeuge auf einmal verschoben werden.`,
    };
  }
  const ids = [];
  for (const raw of value) {
    const id = parsePositiveInt(raw);
    if (!id) return { error: "Ungültige Fahrzeug-ID." };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids };
};

exports.getFolders = async (req, res) => {
  try {
    const [folders, assignments] = await Promise.all([
      db.CarAboFolder.findAll({
        attributes: ["id", "name", "sortOrder"],
        order: [
          ["sortOrder", "ASC"],
          ["name", "ASC"],
        ],
      }),
      db.CarAboFolderAssignment.findAll({
        attributes: ["carAboId", "folderId"],
      }),
    ]);

    const assignmentMap = {};
    for (const assignment of assignments) {
      assignmentMap[assignment.carAboId] = assignment.folderId;
    }

    return res.status(200).json({ folders, assignments: assignmentMap });
  } catch (error) {
    logger("error", `[getCarAboFolders] ${error.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.createFolder = async (req, res) => {
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ error });

  try {
    const maxSortOrder = await db.CarAboFolder.max("sortOrder");
    const folder = await db.CarAboFolder.create({
      name,
      sortOrder: Number.isFinite(maxSortOrder) ? maxSortOrder + 1 : 0,
    });
    return res.status(201).json(folder);
  } catch (err) {
    logger("error", `[createCarAboFolder] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.updateFolder = async (req, res) => {
  const updates = {};
  if (req.body && "name" in req.body) {
    const { name, error } = validateName(req.body.name);
    if (error) return res.status(400).json({ error });
    updates.name = name;
  }
  if (req.body && "sortOrder" in req.body) {
    const sortOrder = Number(req.body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      return res.status(400).json({ error: "Ungültige Sortierung." });
    }
    updates.sortOrder = sortOrder;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Keine Änderungen übermittelt." });
  }

  try {
    const folder = await db.CarAboFolder.findByPk(req.params.id);
    if (!folder) {
      return res.status(404).json({ error: "Ordner nicht gefunden." });
    }
    await folder.update(updates);
    return res.status(200).json(folder);
  } catch (err) {
    logger("error", `[updateCarAboFolder] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

// Fahrzeuge des Ordners landen danach wieder in "Ohne Ordner".
exports.deleteFolder = async (req, res) => {
  try {
    const deleted = await db.sequelize.transaction(async (transaction) => {
      const folder = await db.CarAboFolder.findByPk(req.params.id, {
        transaction,
      });
      if (!folder) return false;
      await db.CarAboFolderAssignment.destroy({
        where: { folderId: folder.id },
        transaction,
      });
      await folder.destroy({ transaction });
      return true;
    });

    if (!deleted) {
      return res.status(404).json({ error: "Ordner nicht gefunden." });
    }
    return res.status(204).send();
  } catch (err) {
    logger("error", `[deleteCarAboFolder] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

// folderId null nimmt die Fahrzeuge aus ihrem Ordner heraus.
exports.moveCarAbos = async (req, res) => {
  const { ids, error } = parseCarAboIds(req.body?.carAboIds);
  if (error) return res.status(400).json({ error });

  const rawFolderId = req.body?.folderId;
  const folderId =
    rawFolderId === null || rawFolderId === undefined
      ? null
      : parsePositiveInt(rawFolderId);
  if (rawFolderId !== null && rawFolderId !== undefined && !folderId) {
    return res.status(400).json({ error: "Ungültige Ordner-ID." });
  }

  try {
    const result = await db.sequelize.transaction(async (transaction) => {
      if (folderId) {
        const folder = await db.CarAboFolder.findByPk(folderId, {
          transaction,
        });
        if (!folder) return { status: 404, error: "Ordner nicht gefunden." };
      }

      const existingCount = await db.CarAbo.count({
        where: { id: ids },
        transaction,
      });
      if (existingCount !== ids.length) {
        return {
          status: 404,
          error: "Mindestens ein Fahrzeug wurde nicht gefunden.",
        };
      }

      await db.CarAboFolderAssignment.destroy({
        where: { carAboId: ids },
        transaction,
      });
      if (folderId) {
        await db.CarAboFolderAssignment.bulkCreate(
          ids.map((carAboId) => ({ carAboId, folderId })),
          { transaction },
        );
      }
      return { status: 200 };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(200).json({ carAboIds: ids, folderId });
  } catch (err) {
    logger("error", `[moveCarAbosToFolder] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports._internals = { validateName, parseCarAboIds, parsePositiveInt };
