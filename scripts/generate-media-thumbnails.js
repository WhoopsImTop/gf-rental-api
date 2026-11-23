#!/usr/bin/env node
"use strict";

/**
 * Erzeugt Thumbnails für bestehende Mediathek-Bilder ohne thumbnailUrl.
 *
 *   node scripts/generate-media-thumbnails.js --dry-run
 *       Zeigt nur, welche Einträge bearbeitet würden.
 *   node scripts/generate-media-thumbnails.js
 *       Erzeugt die Thumbnails nacheinander und speichert thumbnailUrl.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const db = require("../models");
  const {
    createThumbnail,
    filenameFromMediaUrl,
    isRasterImage,
    UPLOAD_DIR,
  } = require("../services/imageVariants");

  const pending = await db.Media.findAll({
    attributes: ["id", "url", "fileType"],
    where: { thumbnailUrl: null },
    order: [["id", "ASC"]],
  });

  const stats = { done: 0, skipped: 0, missing: 0, failed: 0 };

  for (const media of pending) {
    const filename = filenameFromMediaUrl(media.url);
    if (!filename || !isRasterImage(media.fileType)) {
      stats.skipped += 1;
      continue;
    }
    if (!fs.existsSync(path.join(UPLOAD_DIR, path.basename(filename)))) {
      stats.missing += 1;
      console.log(`#${media.id}: Datei fehlt (${filename})`);
      continue;
    }
    if (dryRun) {
      stats.done += 1;
      console.log(`#${media.id}: würde ${filename} verkleinern`);
      continue;
    }

    // Sequentiell, damit der Server während des Laufs ansprechbar bleibt.
    const thumbnailUrl = await createThumbnail(filename, media.fileType);
    if (!thumbnailUrl) {
      stats.failed += 1;
      continue;
    }
    await media.update({ thumbnailUrl });
    stats.done += 1;
  }

  console.log(
    `${dryRun ? "[dry-run] " : ""}${pending.length} ohne Thumbnail: ` +
      `${stats.done} erzeugt, ${stats.skipped} übersprungen (kein Bild), ` +
      `${stats.missing} Datei fehlt, ${stats.failed} fehlgeschlagen.`,
  );
  await db.sequelize.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
