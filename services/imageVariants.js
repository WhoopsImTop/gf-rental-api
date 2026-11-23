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

/**
 * Erkennt das echte Format an den ersten Bytes. Endung und MIME-Typ kommen vom
 * Client; ohne diese Prüfung könnte eine als .jpg getarnte HEIF- oder SVG-Datei
 * die entsprechenden libvips-Decoder erreichen.
 */
async function sniffRasterFormat(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    if (bytesRead < 12) return null;
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "jpeg";
    if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return "png";
    }
    if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") {
      return "webp";
    }
    return null;
  } finally {
    await handle.close();
  }
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
    const format = await sniffRasterFormat(source);
    if (!format) {
      logger("warn", `[createThumbnail] ${filename}: Inhalt ist kein JPEG/PNG/WebP, übersprungen`);
      return null;
    }

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
  sniffRasterFormat,
  thumbnailFilename,
  THUMB_DIR,
  UPLOAD_DIR,
};
