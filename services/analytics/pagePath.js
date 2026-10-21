"use strict";

/**
 * Bereinigt Seitenpfade, bevor sie gespeichert werden: keine Query-Strings
 * oder Fragmente (können Tokens, E-Mail-Adressen o. Ä. enthalten) und
 * Warenkorb-Tokens im Pfad werden ersetzt.
 */
function sanitizePath(value) {
  if (value == null || typeof value !== "string") return null;
  let path = value.trim().slice(0, 2048);
  if (!path) return null;

  path = path.replace(/^https?:\/\/[^/]+/i, "");
  path = path.split(/[?#]/)[0] || "/";
  if (!path.startsWith("/")) path = `/${path}`;

  path = path
    .replace(/[a-f0-9]{32,}/gi, ":token")
    .replace(/[^\w\-./:~%äöüÄÖÜß]/g, "")
    .replace(/\/{2,}/g, "/");

  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path.slice(0, 512) || "/";
}

function sanitizeHostname(value) {
  if (value == null || typeof value !== "string") return null;
  const host = value.trim().toLowerCase();
  return /^[a-z0-9.-]{1,128}$/.test(host) ? host : null;
}

function sanitizeUtm(value, max = 128) {
  if (value == null || typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^\p{L}\p{N} ._\-+/|:]/gu, "").slice(0, max);
  return cleaned || null;
}

module.exports = { sanitizePath, sanitizeHostname, sanitizeUtm };
