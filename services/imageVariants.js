"use strict";

const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { logger } = require("./logging");

// Prod-CPU schonen: ein libvips-Thread pro Bild, kein Datei-Cache im Speicher.
sharp.concurrency(1);
sharp.cache(false);

const UPLOAD_DIR = path.join(__dirname, "..", "public", "uploads");
const THUMB_DIR = path.join(UPLOAD_DIR, "thumbs");
const THUMB_MAX_SIZE = 480;
const THUMB_QUALITY = 72;

const RASTER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRasterImage(mimeType) {
  return RASTER_MIME_TYPES.has(String(mimeType || "").toLowerCase());
}

function thumbnailFilename(filename) {
  return `${path.parse(filename).name}.webp`;
}

function thumbnailUrlFor(filename) {
  return `${process.env.APPIMAGEURL}/uploads/thumbs/${thumbnailFilename(filename)}`;
}

/**
 * Erzeugt eine kleine WebP-Vorschau (max. 480 px Kantenlänge) für die Mediathek.
 * Gibt die öffentliche URL zurück oder null, wenn die Datei kein Rasterbild ist
 * oder die Verarbeitung fehlschlägt – ein Upload scheitert nie am Thumbnail.
 */
async function createThumbnail(filename, mimeType) {
  if (!filename || !isRasterImage(mimeType)) return null;

  const source = path.join(UPLOAD_DIR, path.basename(filename));
  const target = path.join(THUMB_DIR, thumbnailFilename(filename));

  try {
    await fs.mkdir(THUMB_DIR, { recursive: true });
    await sharp(source, { failOn: "none" })
      .rotate()
      .resize(THUMB_MAX_SIZE, THUMB_MAX_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_QUALITY, effort: 4 })
      .toFile(target);
    return thumbnailUrlFor(filename);
  } catch (error) {
    logger("warn", `[createThumbnail] ${filename}: ${error.message}`);
    return null;
  }
}

/** Dateiname einer Mediathek-URL (…/uploads/<datei>), sonst null. */
function filenameFromMediaUrl(url) {
  const match = /\/uploads\/([^/?#]+)$/.exec(String(url || ""));
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = {
  createThumbnail,
  filenameFromMediaUrl,
  isRasterImage,
  thumbnailFilename,
  THUMB_DIR,
  UPLOAD_DIR,
};
