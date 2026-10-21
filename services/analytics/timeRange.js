"use strict";

/**
 * Zeiträume und Zeit-Buckets für das Analytics-Dashboard in Europe/Berlin.
 * Die DB speichert UTC; gruppiert wird per festem Offset des Zeitraum-Endes
 * (an Zeitumstellungstagen kann ein Bucket um eine Stunde verschoben sein).
 */

const TIME_ZONE = "Europe/Berlin";

const RANGES = {
  today: { label: "Heute", bucket: "hour" },
  yesterday: { label: "Gestern", bucket: "hour" },
  "7d": { label: "Letzte 7 Tage", bucket: "day", days: 7 },
  "30d": { label: "Letzte 30 Tage", bucket: "day", days: 30 },
  "90d": { label: "Letzte 90 Tage", bucket: "week", days: 90 },
  "12m": { label: "Letzte 12 Monate", bucket: "month", days: 365 },
};

const DEFAULT_RANGE = "30d";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function berlinParts(date) {
  const parts = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) {
    parts[type] = Number(value);
  }
  return parts;
}

/** Offset von Europe/Berlin zu UTC in Minuten (60 oder 120). */
function berlinOffsetMinutes(date) {
  const p = berlinParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

const pad = (n) => String(n).padStart(2, "0");

function berlinDayKey(date) {
  const p = berlinParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** UTC-Zeitpunkt von Mitternacht (Berlin) des Tages `date` + `dayOffset` Tage. */
function berlinMidnight(date, dayOffset = 0) {
  const p = berlinParts(date);
  const utcGuess = Date.UTC(p.year, p.month - 1, p.day + dayOffset);
  const offset = berlinOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - offset * 60000);
}

function resolveRange(rangeKey, now = new Date()) {
  const key = Object.prototype.hasOwnProperty.call(RANGES, rangeKey)
    ? rangeKey
    : DEFAULT_RANGE;
  const def = RANGES[key];

  let from;
  let to;
  if (key === "today") {
    from = berlinMidnight(now);
    to = now;
  } else if (key === "yesterday") {
    from = berlinMidnight(now, -1);
    to = berlinMidnight(now);
  } else {
    from = berlinMidnight(now, -(def.days - 1));
    to = now;
  }

  const span = to.getTime() - from.getTime();
  const previousTo = key === "today" ? new Date(now.getTime() - 86400000) : from;
  const previousFrom =
    key === "today" ? berlinMidnight(now, -1) : new Date(from.getTime() - span);

  return {
    key,
    label: def.label,
    bucket: def.bucket,
    from,
    to,
    previousFrom,
    previousTo,
    offsetMinutes: berlinOffsetMinutes(to),
  };
}

/** SQL-Ausdruck für den Bucket-Schlüssel einer UTC-Spalte. */
function bucketSql(column, bucket) {
  const local = `DATE_ADD(${column}, INTERVAL :tzOffset MINUTE)`;
  switch (bucket) {
    case "hour":
      return `DATE_FORMAT(${local}, '%Y-%m-%d %H')`;
    case "week":
      return `DATE_FORMAT(DATE_SUB(DATE(${local}), INTERVAL WEEKDAY(${local}) DAY), '%Y-%m-%d')`;
    case "month":
      return `DATE_FORMAT(${local}, '%Y-%m')`;
    default:
      return `DATE_FORMAT(${local}, '%Y-%m-%d')`;
  }
}

const dayKeyFromUtcDate = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Alle Bucket-Schlüssel des Zeitraums (gleiches Format wie bucketSql). */
function bucketKeys(range) {
  const keys = [];
  const startDay = berlinDayKey(range.from);
  const [y, m, d] = startDay.split("-").map(Number);

  if (range.bucket === "hour") {
    const lastHour =
      range.key === "today" ? berlinParts(range.to).hour : 23;
    for (let h = 0; h <= lastHour; h++) keys.push(`${startDay} ${pad(h)}`);
    return keys;
  }

  const endDay = berlinDayKey(new Date(range.to.getTime() - 1));

  if (range.bucket === "month") {
    const [ey, em] = endDay.split("-").map(Number);
    const cursor = new Date(Date.UTC(y, m - 1, 1));
    while (
      cursor.getUTCFullYear() < ey ||
      (cursor.getUTCFullYear() === ey && cursor.getUTCMonth() + 1 <= em)
    ) {
      keys.push(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return keys;
  }

  const cursor = new Date(Date.UTC(y, m - 1, d));
  if (range.bucket === "week") {
    const weekday = (cursor.getUTCDay() + 6) % 7; // Montag = 0
    cursor.setUTCDate(cursor.getUTCDate() - weekday);
  }
  const step = range.bucket === "week" ? 7 : 1;
  while (dayKeyFromUtcDate(cursor) <= endDay) {
    keys.push(dayKeyFromUtcDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + step);
  }
  return keys;
}

/**
 * Date → 'YYYY-MM-DD HH:mm:ss' in UTC. Sequelize formatiert Date-Werte in
 * Raw-Query-Replacements in der Zeitzone des Node-Prozesses, die Spalten
 * werden aber in UTC gespeichert.
 */
const toSqlUtc = (date) => date.toISOString().slice(0, 19).replace("T", " ");

module.exports = {
  RANGES,
  toSqlUtc,
  DEFAULT_RANGE,
  berlinDayKey,
  berlinOffsetMinutes,
  resolveRange,
  bucketSql,
  bucketKeys,
};
