const db = require("../models");
const { logger } = require("../services/logging");
const { createThumbnail } = require("../services/imageVariants");

const MEDIA_ATTRIBUTES = [
  "id",
  "name",
  "fileSize",
  "fileType",
  "url",
  "thumbnailUrl",
  "createdAt",
];
const DEFAULT_PAGE_LIMIT = 48;
const MAX_PAGE_LIMIT = 100;
const MAX_PAGE = 10000;
const MAX_SEARCH_LENGTH = 100;
const MAX_IDS = 100;
const MEDIA_TYPE_FILTERS = new Set(["image", "application"]);

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

/** "1,2,3" → [1, 2, 3]; Müll, Duplikate und Arrays/Objekte werden verworfen. */
const parseIdList = (value) => {
  if (typeof value !== "string") return [];
  const ids = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^\d{1,10}$/.test(part))
    .map((part) => Number.parseInt(part, 10))
    .filter((id) => id > 0);
  return [...new Set(ids)].slice(0, MAX_IDS);
};

/**
 * Liest die Listen-Query. Ohne `page`, `limit` und `ids` bleibt die alte
 * Antwort (komplettes Array) erhalten, damit ältere Aufrufer nicht brechen.
 */
const parseListQuery = (query = {}) => {
  const { Op } = db.Sequelize;
  const where = {};

  const type = typeof query.type === "string" ? query.type : "";
  if (MEDIA_TYPE_FILTERS.has(type)) {
    where.fileType = { [Op.like]: `${type}/%` };
  }

  const search =
    typeof query.search === "string"
      ? query.search.trim().slice(0, MAX_SEARCH_LENGTH)
      : "";
  if (search) {
    where.name = { [Op.like]: `%${search.replace(/[\\%_]/g, "\\$&")}%` };
  }

  if (query.ids !== undefined) {
    return { mode: "ids", ids: parseIdList(query.ids), where };
  }

  if (query.page === undefined && query.limit === undefined) {
    return { mode: "all", where };
  }

  const page = parsePositiveInt(query.page, 1, MAX_PAGE);
  const limit = parsePositiveInt(query.limit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  return { mode: "page", page, limit, offset: (page - 1) * limit, where };
};

const createMediaFromFile = async (file) => {
  const thumbnailUrl = await createThumbnail(file.filename, file.mimetype);
  return db.Media.create({
    name: file.originalname,
    fileSize: file.size,
    fileType: file.mimetype,
    url: process.env.APPIMAGEURL + "/uploads/" + file.filename,
    thumbnailUrl,
  });
};

exports.uploadMedia = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a file!" });
    }

    const media = await createMediaFromFile(req.file);

    return res.status(201).json({
      message: "File uploaded successfully",
      media: media,
    });
  } catch (error) {
    logger("error", `[uploadMedia] ${error.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.uploadMultipleMedia = async (req, res) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Please upload at least one file!" });
    }

    const uploadedMedia = [];

    // Nacheinander, damit die Thumbnail-Erzeugung die CPU nicht blockiert.
    for (const file of req.files) {
      uploadedMedia.push(await createMediaFromFile(file));
    }

    return res.status(201).json({
      message: `${uploadedMedia.length} files uploaded successfully`,
      media: uploadedMedia,
    });
  } catch (error) {
    logger("error", `[uploadMultipleMedia] ${error.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.getAllMedia = async (req, res) => {
  const listQuery = parseListQuery(req.query);

  try {
    if (listQuery.mode === "ids") {
      if (listQuery.ids.length === 0) return res.status(200).json([]);
      const { Op } = db.Sequelize;
      const media = await db.Media.findAll({
        attributes: MEDIA_ATTRIBUTES,
        where: { ...listQuery.where, id: { [Op.in]: listQuery.ids } },
      });
      return res.status(200).json(media);
    }

    if (listQuery.mode === "all") {
      const media = await db.Media.findAll({
        attributes: MEDIA_ATTRIBUTES,
        where: listQuery.where,
        order: [["createdAt", "DESC"]],
      });
      return res.status(200).json(media);
    }

    const { page, limit, offset, where } = listQuery;
    const { rows, count } = await db.Media.findAndCountAll({
      attributes: MEDIA_ATTRIBUTES,
      where,
      order: [
        ["createdAt", "DESC"],
        ["id", "DESC"],
      ],
      limit,
      offset,
    });

    return res.status(200).json({
      media: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger("error", `[getAllMedia] ${error.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.getMediaById = async (req, res) => {
  try {
    const { id } = req.params;
    const media = await db.Media.findByPk(id, {
      attributes: MEDIA_ATTRIBUTES,
    });

    if (!media) {
      return res.status(404).json({ error: "Media not found" });
    }

    return res.status(200).json(media);
  } catch (error) {
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db.Media.destroy({
      where: { id: id },
    });

    if (deleted) {
      return res.status(204).json({ message: "Media deleted successfully" });
    } else {
      return res.status(404).json({ error: "Media not found" });
    }
  } catch (error) {
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

// Nur für Tests exportiert
exports._internals = { parseIdList, parseListQuery };
