#!/usr/bin/env node
"use strict";

/**
 * Findet Mediathek-Einträge und Upload-Dateien, die nirgends verwendet werden.
 * Liest nur – es wird nichts gelöscht oder geändert.
 *
 *   node scripts/find-unused-media.js [--min-age-days 30] [--out <datei.json>] [--all-tables]
 *
 * Als "verwendet" gilt ein Bild, wenn es
 *   - über eine ID verknüpft ist (Auto-Abo-Galerie, Farben, Carsharing-Bilder,
 *     Bildblöcke der Fahrzeugseite, CRM-Status-Anhang), oder
 *   - mit seinem Dateinamen in irgendeiner Text-/JSON-Spalte der Datenbank vorkommt
 *     (Marketing-Bilder, HTML-Beschreibungen, E-Mail-Logs, Settings, ...).
 *
 * Nicht erkennbar sind Verweise von außerhalb der Datenbank (WordPress-Seiten,
 * bereits verschickte Newsletter, hart codierte URLs in Frontends).
 */
require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const MIN_AGE_DAYS = Number.parseInt(option("--min-age-days", "30"), 10);
const OUT_FILE = path.resolve(
  option("--out", path.join(os.tmpdir(), `unused-media-${new Date().toISOString().slice(0, 10)}.json`)),
);
const SCAN_ALL_TABLES = args.includes("--all-tables");

// Große Tabellen ohne Bild-URLs nicht durchsuchen, um die Prod-DB zu schonen.
const SKIPPED_TABLE_PATTERN =
  /^(Media|SequelizeMeta|PageVisits|AnalyticsSalts|Sessions|PasswordResetCodes|VerificationCodes|CartClientErrors|CartCheckoutEvents|Postleitzahlen|Locations|Operators)$|^rag_|charging|evse|sync_?state|connector|tariff/i;

const TEXT_COLUMN_TYPES = ["char", "varchar", "tinytext", "text", "mediumtext", "longtext", "json"];

// Direkte ID-Verknüpfungen: [Tabelle, Spalte, Beschreibung]
const ID_REFERENCES = [
  ["CarAboMedia", "mediaId", "Auto-Abo-Galerie"],
  ["CarAboColorMedia", "mediaId", "Auto-Abo-Farbbilder"],
  ["CarAboColors", "mediaId", "Auto-Abo-Farbe"],
  ["CarAbos", "mediaId", "Auto-Abo (Altfeld mediaId)"],
  ["carsharingCarsImages", "mediaId", "Carsharing-Fahrzeugbilder"],
  ["MediaCrmCarAbos", "mediaId", "MediaCrmCarAbos"],
];

const UPLOAD_REFERENCE_PATTERN = /\/uploads\/((?:thumbs\/)?[^"'\s)<>?#\\]+)/g;

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Dateiname relativ zu /uploads/ (z. B. "123.jpg" oder "thumbs/123.webp"). */
const uploadKeyFromUrl = (url) => {
  const match = /\/uploads\/((?:thumbs\/)?[^/?#]+)$/.exec(String(url || ""));
  return match ? safeDecode(match[1]) : null;
};

const addReason = (map, key, reason) => {
  if (key === null || key === undefined) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(reason);
};

async function main() {
  const db = require("../models");
  const { QueryTypes } = db.Sequelize;
  const query = (sql, replacements = {}) =>
    db.sequelize.query(sql, { type: QueryTypes.SELECT, replacements, logging: false });
  const database = db.sequelize.config.database;

  const existingColumns = await query(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, DATA_TYPE AS dataType
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = :database`,
    { database },
  );
  const hasColumn = (table, column) =>
    existingColumns.some((c) => c.tableName === table && c.columnName === column);

  const mediaRows = await query(
    "SELECT id, name, url, thumbnailUrl, fileType, fileSize, statusId, createdAt FROM `Media`",
  ).catch(() =>
    // Vor der thumbnailUrl-Migration
    query("SELECT id, name, url, NULL AS thumbnailUrl, fileType, fileSize, statusId, createdAt FROM `Media`"),
  );

  const reasonsById = new Map();
  const reasonsByFile = new Map();

  // ─── ID-Verknüpfungen ───
  for (const [table, column, label] of ID_REFERENCES) {
    if (!hasColumn(table, column)) continue;
    const rows = await query(
      `SELECT DISTINCT \`${column}\` AS mediaId FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`,
    );
    rows.forEach((row) => addReason(reasonsById, Number(row.mediaId), label));
  }

  mediaRows
    .filter((media) => media.statusId !== null)
    .forEach((media) => addReason(reasonsById, media.id, "CRM-Status-Anhang"));

  // Bildblöcke speichern nur die mediaId im JSON, keine URL.
  if (hasColumn("CarsharingCars", "pageBlocks")) {
    const cars = await query("SELECT id, pageBlocks FROM `CarsharingCars` WHERE pageBlocks IS NOT NULL");
    for (const car of cars) {
      let blocks = car.pageBlocks;
      if (typeof blocks === "string") {
        try {
          blocks = JSON.parse(blocks);
        } catch {
          blocks = [];
        }
      }
      (Array.isArray(blocks) ? blocks : [])
        .filter((block) => block?.type === "image")
        .forEach((block) =>
          addReason(reasonsById, Number(block.mediaId), `Fahrzeugseite Carsharing #${car.id}`),
        );
    }
  }

  // ─── Volltextsuche nach Upload-URLs ───
  const textColumns = existingColumns.filter((c) => TEXT_COLUMN_TYPES.includes(c.dataType));
  const scannedTables = new Set();
  const skippedTables = new Set();

  for (const { tableName, columnName } of textColumns) {
    if (!SCAN_ALL_TABLES && SKIPPED_TABLE_PATTERN.test(tableName)) {
      skippedTables.add(tableName);
      continue;
    }
    scannedTables.add(tableName);
    const rows = await query(
      `SELECT \`${columnName}\` AS value FROM \`${tableName}\` WHERE \`${columnName}\` LIKE '%/uploads/%'`,
    );
    for (const row of rows) {
      const text = String(row.value ?? "");
      for (const match of text.matchAll(UPLOAD_REFERENCE_PATTERN)) {
        addReason(reasonsByFile, safeDecode(match[1]), `${tableName}.${columnName}`);
      }
    }
  }

  // ─── Auswertung Mediathek ───
  const uploadDir = path.join(__dirname, "..", "public", "uploads");
  const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  const knownFiles = new Set();

  const report = { used: [], unused: [], recentUnused: [] };
  for (const media of mediaRows) {
    const fileKey = uploadKeyFromUrl(media.url);
    const thumbKey = uploadKeyFromUrl(media.thumbnailUrl);
    if (fileKey) knownFiles.add(fileKey);

    const reasons = new Set([
      ...(reasonsById.get(media.id) || []),
      ...(reasonsByFile.get(fileKey) || []),
      ...(reasonsByFile.get(thumbKey) || []),
    ]);
    const fileExists = fileKey ? fs.existsSync(path.join(uploadDir, path.basename(fileKey))) : false;
    const entry = {
      id: media.id,
      name: media.name,
      url: media.url,
      fileSize: media.fileSize,
      createdAt: media.createdAt,
      fileExists,
      reasons: [...reasons],
    };

    if (reasons.size > 0) report.used.push(entry);
    else if (new Date(media.createdAt).getTime() > cutoff) report.recentUnused.push(entry);
    else report.unused.push(entry);
  }

  // ─── Dateien ohne Mediathek-Eintrag ───
  const filesOnDisk = fs.existsSync(uploadDir)
    ? fs.readdirSync(uploadDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name)
    : [];
  const orphanFiles = filesOnDisk
    .filter((file) => !file.startsWith(".") && !knownFiles.has(file))
    .map((file) => ({
      file,
      size: fs.statSync(path.join(uploadDir, file)).size,
      reasons: [...(reasonsByFile.get(file) || [])],
    }));

  // Mehrfach hochgeladene Dateien (gleicher Name + gleiche Größe)
  const groups = new Map();
  for (const entry of [...report.used, ...report.unused, ...report.recentUnused]) {
    const key = `${entry.name}|${entry.fileSize}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const duplicates = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      name: group[0].name,
      fileSize: group[0].fileSize,
      ids: group.map((entry) => entry.id),
      usedIds: group.filter((entry) => entry.reasons.length > 0).map((entry) => entry.id),
    }));

  const bytes = (list, key) => list.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
  const mb = (value) => `${(value / 1048576).toFixed(1)} MB`;
  const unreferencedOrphans = orphanFiles.filter((f) => f.reasons.length === 0);

  const summary = {
    mediaTotal: mediaRows.length,
    used: report.used.length,
    unused: report.unused.length,
    unusedSize: mb(bytes(report.unused, "fileSize")),
    recentUnused: report.recentUnused.length,
    unusedWithMissingFile: report.unused.filter((m) => !m.fileExists).length,
    orphanFiles: orphanFiles.length,
    orphanFilesUnreferenced: unreferencedOrphans.length,
    orphanFilesSize: mb(bytes(unreferencedOrphans, "size")),
    duplicateGroups: duplicates.length,
    minAgeDays: MIN_AGE_DAYS,
    scannedTables: [...scannedTables].sort(),
    skippedTables: [...skippedTables].sort(),
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify({ summary, ...report, orphanFiles, duplicates }, null, 2));

  console.log(`Mediathek: ${summary.mediaTotal} Einträge`);
  console.log(`  verwendet:            ${summary.used}`);
  console.log(`  unbenutzt:            ${summary.unused} (${summary.unusedSize}), davon Datei fehlt: ${summary.unusedWithMissingFile}`);
  console.log(`  unbenutzt, < ${MIN_AGE_DAYS} Tage:  ${summary.recentUnused} (nicht als Löschkandidat gezählt)`);
  console.log(`Dateien ohne Mediathek-Eintrag: ${summary.orphanFiles}, davon unreferenziert: ${summary.orphanFilesUnreferenced} (${summary.orphanFilesSize})`);
  console.log(`Duplikate (Name + Größe): ${summary.duplicateGroups} Gruppen`);
  console.log(`Durchsuchte Tabellen: ${summary.scannedTables.length}, übersprungen: ${summary.skippedTables.join(", ") || "-"}`);
  console.log(`Bericht: ${OUT_FILE}`);

  await db.sequelize.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
