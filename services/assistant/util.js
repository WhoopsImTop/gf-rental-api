"use strict";

const crypto = require("crypto");

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function slugify(input, maxLength = 60) {
  return String(input || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

/** Normalisierter Text für Duplikat-Erkennung (Groß/Klein, Leerraum, Satzzeichen egal). */
function normalizeForHash(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .trim();
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8222;/g, "„")
    .replace(/&#8220;/g, "“")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Letzter Pfadteil einer URL ("…/so-geht-carsharing/buchen/" → "buchen"). */
function slugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    return "";
  }
}

/** Pfad relativ zur Site-Basis ("so-geht-carsharing/buchen"). */
function relativePath(url, siteBase) {
  try {
    const base = new URL(siteBase).pathname.replace(/\/$/, "");
    return new URL(url).pathname.replace(base, "").replace(/^\/|\/$/g, "");
  } catch {
    return "";
  }
}

const MONTHS = {
  januar: 1, februar: 2, maerz: 3, märz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

/**
 * Liest ein Gültigkeitsdatum aus Titeln wie "Mietpreise ab Oktober 2026" oder
 * "Neue Tarife ab 01.06.2026". Ergebnis "YYYY-MM-DD" oder null.
 */
function parseValidFrom(text) {
  const value = String(text || "").toLowerCase();
  const exact = value.match(/ab\s+(?:dem\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (exact) {
    return `${exact[3]}-${exact[2].padStart(2, "0")}-${exact[1].padStart(2, "0")}`;
  }
  const month = value.match(/ab\s+([a-zäöü]+)\s+(\d{4})/);
  if (month && MONTHS[month[1]]) {
    return `${month[2]}-${String(MONTHS[month[1]]).padStart(2, "0")}-01`;
  }
  return null;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  // Stichtag in deutscher Zeit
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

function formatDateDe(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = String(isoDate).slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  sha256,
  slugify,
  normalizeForHash,
  decodeEntities,
  slugFromUrl,
  relativePath,
  parseValidFrom,
  addDays,
  todayIso,
  formatDateDe,
  chunkArray,
  sleep,
};
