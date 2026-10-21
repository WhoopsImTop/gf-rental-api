"use strict";

/**
 * Cookieloses Wiedererkennen von Besuchern (Prinzip wie Plausible):
 *   visitorId = sha256(Tages-Salt + IP + User-Agent)
 *
 * - Auf dem Endgerät wird nichts gespeichert oder ausgelesen.
 * - IP und User-Agent werden nur flüchtig für den Hash verwendet, nie gespeichert.
 * - Der Salt ist zufällig, gilt für einen Kalendertag (Europe/Berlin) und wird
 *   danach gelöscht. Ab dann lässt sich der Hash keiner Person mehr zuordnen,
 *   und derselbe Besucher erhält am nächsten Tag eine neue, unverknüpfbare ID.
 */

const crypto = require("crypto");
const { Op } = require("sequelize");
const { berlinDayKey } = require("./timeRange");

let cachedSalt = { day: null, salt: null };

async function getDailySalt() {
  const day = berlinDayKey(new Date());
  if (cachedSalt.day === day) return cachedSalt.salt;

  const { AnalyticsSalt } = require("../../models");
  const [row] = await AnalyticsSalt.findOrCreate({
    where: { day },
    defaults: { salt: crypto.randomBytes(32).toString("hex") },
  });
  await AnalyticsSalt.destroy({ where: { day: { [Op.ne]: day } } });

  cachedSalt = { day, salt: row.salt };
  return row.salt;
}

async function computeVisitorId(ip, userAgent) {
  const salt = await getDailySalt();
  return crypto
    .createHash("sha256")
    .update(`${salt}|${ip || ""}|${userAgent || ""}`)
    .digest("hex")
    .slice(0, 32);
}

function resetSaltCacheForTests() {
  cachedSalt = { day: null, salt: null };
}

module.exports = { computeVisitorId, resetSaltCacheForTests };
