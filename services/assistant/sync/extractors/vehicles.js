"use strict";

const { Op } = require("sequelize");
const config = require("../../config");
const { htmlToMarkdown } = require("./markdown");

/** MariaDB liefert JSON-Spalten teils als (doppelt) serialisierten String. */
function parseJsonField(value) {
  let parsed = value;
  for (let i = 0; i < 2 && typeof parsed === "string"; i += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return parsed;
}

/** {"columns": [...], "rows": [[...]]} → Markdown-Tabelle */
function tableToMarkdown(value) {
  const table = parseJsonField(value);
  if (!table || !Array.isArray(table.rows) || !table.rows.length) return "";
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : table.rows[0].map(() => "");
  const clean = (cell) => String(cell ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const line = (cells) => `| ${columns.map((_, i) => clean(cells[i])).join(" | ")} |`;
  return [line(columns), line(columns.map(() => "---")), ...table.rows.map(line)].join("\n");
}

function vehicleUrl(car) {
  return config.VEHICLE_URL_TEMPLATE.replace("{id}", String(car.id));
}

function blocksToMarkdown(blocks) {
  const parts = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block.type === "text") parts.push(htmlToMarkdown(block.body_html));
    if (block.type === "accordion") {
      for (const item of block.items || []) {
        if (item.title) parts.push(`**${item.title}**\n\n${htmlToMarkdown(item.body_html)}`);
      }
    }
    if (block.type === "links") {
      const links = (block.items || []).filter((item) => item.label && /^https?:/.test(item.url || ""));
      if (links.length) parts.push(links.map((item) => `- [${item.label}](${item.url})`).join("\n"));
    }
  }
  return parts.filter(Boolean).join("\n\n");
}

function blockVideos(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block.type === "video" && block.url)
    .map((block) => ({ type: "video", src: block.url, title: block.title || "Video", provider: block.provider || null }));
}

/**
 * Fahrzeuge aus dem CRM (CarsharingCar inkl. pageBlocks) – führende Quelle für Fahrzeugdaten.
 * Liefert je Fahrzeug Quelle + extrahierten Inhalt + strukturierte Fakten für find_vehicles.
 */
async function loadVehicles(db) {
  const cars = await db.CarsharingCar.findAll({
    where: { status: { [Op.in]: ["active", "coming_soon"] } },
    order: [["id", "ASC"]],
  });

  return cars.map((model) => {
    const car = model.toJSON();
    const name = [car.name, car.subline].filter(Boolean).join(" ").trim() || `Fahrzeug ${car.id}`;
    const pageBlocks = car.pageEnabled ? parseJsonField(car.pageBlocks) || [] : [];

    const facts = {
      id: car.id,
      name,
      size: car.size || null,
      fuel: car.fuel || null,
      gear: car.gear || null,
      status: car.status,
      availableFrom: car.availableFrom || null,
      comingSoonText: car.comingSoonText || null,
      url: vehicleUrl(car),
    };

    const lines = [
      `Fahrzeug: ${name}`,
      car.size ? `Fahrzeugklasse: ${car.size}` : null,
      car.fuel ? `Antrieb/Kraftstoff: ${car.fuel}` : null,
      car.gear ? `Getriebe: ${car.gear}` : null,
      car.status === "coming_soon"
        ? `Status: Demnächst verfügbar${car.availableFrom ? ` (ab ${car.availableFrom})` : ""}${car.comingSoonText ? ` – ${car.comingSoonText}` : ""}`
        : "Status: im Carsharing verfügbar",
    ].filter(Boolean);

    const sections = [
      { headingPath: [name], heading: name, anchor: null, markdown: lines.join("\n") },
    ];
    if (car.shortDescription) sections.push({ headingPath: [name, "Kurzbeschreibung"], heading: "Kurzbeschreibung", anchor: null, markdown: car.shortDescription });
    if (car.description) sections.push({ headingPath: [name, "Beschreibung"], heading: "Beschreibung", anchor: null, markdown: htmlToMarkdown(car.description) });
    if (car.equipment) sections.push({ headingPath: [name, "Ausstattung"], heading: "Ausstattung", anchor: null, markdown: String(car.equipment).trim() });
    const technical = tableToMarkdown(car.technicalData);
    if (technical) sections.push({ headingPath: [name, "Technische Daten"], heading: "Technische Daten", anchor: null, markdown: technical });
    const weight = tableToMarkdown(car.weightAndPayload);
    if (weight) sections.push({ headingPath: [name, "Gewicht & Zuladung"], heading: "Gewicht & Zuladung", anchor: null, markdown: weight });
    const pageText = blocksToMarkdown(pageBlocks);
    if (pageText) sections.push({ headingPath: [name, "Fahrzeugseite"], heading: "Weitere Informationen", anchor: null, markdown: pageText });

    return {
      source: {
        source_key: `vehicle:${car.id}`,
        type: "vehicle",
        url: facts.url,
        wp_id: null,
        slug: `vehicle-${car.id}`,
        title: name,
        breadcrumb: ["Fahrzeugflotte", name],
        robots: null,
        lastmod: car.updatedAt ? new Date(car.updatedAt).toISOString() : null,
        published_at: null,
        excluded_reason: null,
      },
      extracted: {
        htmlTitle: name,
        sections,
        faqs: [],
        toggles: [],
        videos: [],
        files: [],
        vehicleVideos: blockVideos(pageBlocks),
        vehicle: facts,
      },
    };
  });
}

module.exports = { loadVehicles, tableToMarkdown, parseJsonField };
