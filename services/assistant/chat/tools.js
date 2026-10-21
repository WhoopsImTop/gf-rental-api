"use strict";

const config = require("../config");
const { formatDateDe } = require("../util");
const { formatEuro } = require("../sync/chunker");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const TARIFFS = {
  green: { label: "Grüne Karte", timeDiscount: 0, kmDiscount: 0, credit: 0 },
  gold: { label: "Goldene Karte", timeDiscount: 0.1, kmDiscount: 0, credit: 10 },
  black: { label: "Schwarze Karte", timeDiscount: 0.1, kmDiscount: 0.1, credit: 30 },
};
const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

class ToolError extends Error {}

/** "YYYY-MM-DDTHH:mm" als Wandzeit (wie der Website-Rechner im Browser, ohne Sommerzeit-Sonderfälle). */
function parseLocal(value, label) {
  const match = String(value || "").match(LOCAL_DATETIME_RE);
  if (!match) throw new ToolError(`${label} muss im Format YYYY-MM-DDTHH:mm angegeben werden.`);
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (Number.isNaN(date.getTime())) throw new ToolError(`${label} ist kein gültiges Datum.`);
  return date;
}

const round2 = (value) => Math.round(value * 100) / 100;

/** Preisversion, die zum Stichtag gilt. */
function priceFactFor(facts, asOf) {
  return facts
    .filter((fact) => fact.key === "price_table")
    .filter((fact) => (!fact.valid_from || fact.valid_from <= asOf) && (!fact.valid_until || fact.valid_until >= asOf))
    .sort((a, b) => String(b.valid_from || "").localeCompare(String(a.valid_from || "")))[0] || null;
}

/**
 * Nachbildung von berechneMietpreis() der Website (Preisrechner auf der Mietpreis-Seite).
 * Die Regeln (Rabatte, Guthaben, Nachtstunden, km-Staffel, Deckelung, 4-für-3) werden beim Einlernen
 * gegen den Quellcode der Website geprüft (calculatorLogic.verified).
 */
function estimatePrice(prices, { vehicleClass, tariff, start, end, km, includeCredit = false, today }) {
  const calc = prices?.calculator;
  if (!calc) throw new ToolError("Keine Preisrechner-Daten vorhanden.");
  if (!calc.classes.includes(vehicleClass)) throw new ToolError(`Unbekannte Fahrzeugklasse ${vehicleClass}. Erlaubt: ${calc.classes.join(", ")}.`);
  const rules = TARIFFS[tariff];
  if (!rules) throw new ToolError("tariff muss green, gold oder black sein.");
  const kilometers = Number(km);
  if (!Number.isFinite(kilometers) || kilometers < 0 || kilometers > 20000) throw new ToolError("km muss zwischen 0 und 20000 liegen.");

  const startDate = parseLocal(start, "start");
  const endDate = parseLocal(end, "end");
  if (endDate <= startDate) throw new ToolError("end muss nach start liegen.");

  let diffMs = Math.max(endDate - startDate, HOUR);
  const bookedHours = diffMs / HOUR;

  let promoActive = false;
  const promo = prices.promo;
  if (promo && promo.aktiv) {
    const from = promo.von ? `${promo.von}` : null;
    const until = promo.bis ? `${promo.bis}` : null;
    const startDay = start.slice(0, 10);
    const promoRunning = (!from || today >= from) && (!until || (today <= until && startDay <= until));
    if (promoRunning && bookedHours >= 96 && bookedHours <= 120) {
      diffMs -= DAY;
      promoActive = true;
    }
  }

  const weeks = Math.floor(diffMs / WEEK);
  let rest = diffMs % WEEK;
  const days = Math.floor(rest / DAY);
  rest %= DAY;
  const hours = Math.ceil(rest / HOUR);

  const hourly = calc.hourly[vehicleClass];
  const daily = calc.daily[vehicleClass];
  const weekly = calc.weekly[vehicleClass];

  let hourCost = 0;
  if (hours > 0) {
    const restStart = startDate.getTime() + weeks * WEEK + days * DAY;
    for (let i = 0; i < hours; i += 1) {
      const hour = new Date(restStart + i * HOUR).getUTCHours();
      hourCost += hour < 7 ? hourly.night : hourly.day;
    }
    hourCost = Math.min(hourCost, daily);
  }

  const best = (w, d, hCost) => {
    const totalWeeks = w + Math.floor(d / 7);
    const remainingDays = d % 7;
    const threeDayBlocks = Math.floor(remainingDays / 3);
    const singleDays = remainingDays % 3;
    return totalWeeks * weekly + threeDayBlocks * daily * 3 + singleDays * daily + hCost;
  };

  let timePrice = Math.min(best(weeks, days, hourCost), best(weeks, days + 1, 0), best(weeks + 1, 0, 0));
  timePrice *= 1 - rules.timeDiscount;

  const upTo100 = calc.km.upTo100[vehicleClass];
  const above100 = calc.km.above100[vehicleClass];
  const kmBase = kilometers <= 100 ? kilometers * upTo100 : 100 * upTo100 + (kilometers - 100) * above100;
  let kmPrice = kmBase * (1 - rules.kmDiscount);

  let fuelSurcharge = 0;
  if (prices.fuelSurcharge?.value) {
    fuelSurcharge = prices.fuelSurcharge.isPercent ? (kmBase * prices.fuelSurcharge.value) / 100 : kilometers * prices.fuelSurcharge.value;
    kmPrice = Math.max(0, kmPrice + fuelSurcharge);
  }

  const credit = includeCredit ? rules.credit : 0;
  const total = Math.max(0, timePrice + kmPrice - credit);

  const notes = ["Schätzung nach dem Preisrechner der Website; die finalen Preise stehen im Buchungssystem."];
  if (tariff !== "green") notes.push(`Die Monatsgebühr der ${rules.label} ist nicht enthalten.`);
  if (bookedHours > 16 * 24) notes.push("Buchungen über 16 Tage sind online nicht möglich (laut Website: bis 1 Monat über den Kundensupport).");

  return {
    vehicleClass,
    tariff: rules.label,
    start,
    end,
    km: kilometers,
    durationHours: round2(bookedHours),
    breakdown: { weeks, days, hours },
    timePrice: round2(timePrice),
    kmPrice: round2(kmPrice),
    fuelSurcharge: round2(fuelSurcharge),
    credit,
    total: round2(total),
    promoActive,
    notes,
  };
}

function describeEstimate(result, fact) {
  return [
    `Preisschätzung (${fact.label}): Fahrzeugklasse ${result.vehicleClass}, ${result.tariff}, ${result.start.replace("T", " ")} bis ${result.end.replace("T", " ")}, ${result.km} km`,
    `Dauer: ${result.durationHours} Stunden (${result.breakdown.weeks} Wochen, ${result.breakdown.days} Tage, ${result.breakdown.hours} Stunden)`,
    `Zeitpreis: ${formatEuro(result.timePrice)}`,
    `Kilometerpreis inkl. Kraftstoffzuschlag: ${formatEuro(result.kmPrice)} (davon Kraftstoffzuschlag ${formatEuro(result.fuelSurcharge)})`,
    result.credit ? `Abzüglich Fahrtguthaben: ${formatEuro(result.credit)}` : null,
    result.promoActive ? "Aktion 4 für 3 Tage angewendet." : null,
    `Gesamtpreis (Schätzung): ${formatEuro(result.total)}`,
    ...result.notes,
  ]
    .filter(Boolean)
    .join("\n");
}

function describePrices(fact, { vehicleClass, tariff }) {
  const prices = fact.data.prices;
  const table = prices.tariffs.green;
  const classes = vehicleClass ? [vehicleClass] : prices.classes;
  const rows = [...table.time, ...table.km];
  const lines = [
    `${fact.label}${fact.valid_from ? ` (gültig ab ${formatDateDe(fact.valid_from)}${fact.valid_until ? ` bis ${formatDateDe(fact.valid_until)}` : ""})` : ""}`,
    "Grundpreise je Fahrzeugklasse:",
    ...classes.map((cls) => `- Klasse ${cls}: ${rows.map((row) => `${row.title} ${formatEuro(row.values[cls])}`).join("; ")}`),
  ];
  if (prices.calculatorLogic?.verified) {
    lines.push(
      "Karten: Grüne Karte ohne Rabatt; Goldene Karte 10 % Rabatt auf den Zeitpreis und 10 € Fahrtguthaben pro Monat; Schwarze Karte 10 % Rabatt auf Zeit- und Kilometerpreis und 30 € Fahrtguthaben pro Monat.",
      "Abgerechnet wird automatisch die günstigste Kombination aus Stunden-, Tages- und Wochenpreisen.",
    );
  }
  if (tariff && TARIFFS[tariff]) lines.push(`Gefragter Tarif: ${TARIFFS[tariff].label}.`);
  if (prices.fuelSurcharge && !prices.fuelSurcharge.isPercent) lines.push(`Kraftstoffzuschlag: ${formatEuro(prices.fuelSurcharge.value)} pro km.`);
  if (!fact.data.consistent) lines.push("ACHTUNG: Die Preisdaten dieser Version sind auf der Website widersprüchlich.");
  return lines.join("\n");
}

/** Optionaler Parameter im Strict-Mode: Wert oder null. */
const nullable = ({ description, ...schema }) => ({ anyOf: [schema, { type: "null" }], ...(description ? { description } : {}) });

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_prices",
      description: "Liefert die gültigen Mietpreise (Stunde 7–24 Uhr, Nacht 0–7 Uhr, Tag, Woche, Kilometer) je Fahrzeugklasse, Kartenrabatte und Kraftstoffzuschlag zum Stichtag.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["vehicle_class", "tariff"],
        properties: {
          vehicle_class: nullable({ type: "string", enum: ["XS", "S", "M", "L", "XL", "XXL"], description: "Fahrzeugklasse oder null für alle" }),
          tariff: nullable({ type: "string", enum: ["green", "gold", "black"], description: "Karte: green=Grün, gold=Gold, black=Schwarz" }),
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_price",
      description: "Berechnet eine Preisschätzung für eine konkrete Fahrt exakt wie der Preisrechner der Website (Bestpreis aus Stunden/Tagen/Wochen, km-Staffel, Kartenrabatte, Kraftstoffzuschlag).",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["vehicle_class", "tariff", "start", "end", "km", "include_credit"],
        properties: {
          vehicle_class: { type: "string", enum: ["XS", "S", "M", "L", "XL", "XXL"] },
          tariff: { type: "string", enum: ["green", "gold", "black"], description: "Ohne Angabe des Nutzers: green" },
          start: { type: "string", description: "Beginn als YYYY-MM-DDTHH:mm (Ortszeit). Ohne Datum: nächster passender Tag ab Stichtag." },
          end: { type: "string", description: "Ende als YYYY-MM-DDTHH:mm (Ortszeit)" },
          km: { type: "number", description: "Gefahrene Kilometer (Schätzung des Nutzers, sonst 0)" },
          include_credit: { type: "boolean", description: "Monatliches Fahrtguthaben der Gold-/Schwarz-Karte abziehen" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_vehicles",
      description: "Sucht Fahrzeuge der Carsharing-Flotte nach Klasse, Antrieb, Getriebe oder Name.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["size", "fuel", "gear", "query"],
        properties: {
          size: nullable({ type: "string", enum: ["XXS", "XS", "S", "M", "L", "XL", "XXL"] }),
          fuel: nullable({ type: "string", enum: ["Benzin", "Diesel", "Elektro", "Hybrid"] }),
          gear: nullable({ type: "string", enum: ["Automatik", "Schaltgetriebe"] }),
          query: nullable({ type: "string", description: "Freitext, z. B. Modellname" }),
        },
      },
    },
  },
];

/**
 * Führt ein Tool aus. Ergebnis: { title, url, text, data } – text ist die zitierfähige Quelle.
 */
function runTool(name, args, { facts, asOf }) {
  if (name === "get_prices" || name === "estimate_price") {
    const fact = priceFactFor(facts, asOf);
    if (!fact) throw new ToolError(`Für den ${formatDateDe(asOf)} sind keine Preisdaten eingelernt.`);

    if (name === "get_prices") {
      return {
        title: `Preisdaten: ${fact.label}`,
        url: fact.source_url,
        text: describePrices(fact, { vehicleClass: args.vehicle_class, tariff: args.tariff }),
        data: { label: fact.label, validFrom: fact.valid_from, validUntil: fact.valid_until },
      };
    }

    if (!fact.data.estimateEnabled) {
      throw new ToolError("Preisschätzung ist für diese Preisversion deaktiviert (Preisdaten oder Rechenlogik auf der Website widersprüchlich).");
    }
    const result = estimatePrice(fact.data.prices, {
      vehicleClass: args.vehicle_class,
      tariff: args.tariff,
      start: args.start,
      end: args.end,
      km: args.km,
      includeCredit: Boolean(args.include_credit),
      today: asOf,
    });
    return { title: `Preisrechner: ${fact.label}`, url: fact.source_url.replace(/#.*$/, "#preiskalkulator"), text: describeEstimate(result, fact), data: result };
  }

  if (name === "find_vehicles") {
    const fact = facts.find((entry) => entry.key === "vehicles");
    const vehicles = fact?.data?.vehicles || [];
    const query = String(args.query || "").toLowerCase();
    const matches = vehicles.filter(
      (vehicle) =>
        (!args.size || vehicle.size === args.size) &&
        (!args.fuel || vehicle.fuel === args.fuel) &&
        (!args.gear || vehicle.gear === args.gear) &&
        (!query || vehicle.name.toLowerCase().includes(query)),
    );
    const lines = matches.slice(0, 20).map((vehicle) =>
      `- ${vehicle.name}: Klasse ${vehicle.size || "–"}, ${vehicle.fuel || "–"}, ${vehicle.gear || "–"}${vehicle.status === "coming_soon" ? `, demnächst verfügbar${vehicle.comingSoonText ? ` (${vehicle.comingSoonText})` : ""}` : ""}`,
    );
    return {
      title: "Fahrzeugflotte",
      url: fact?.source_url || config.VEHICLE_URL_TEMPLATE.replace("{id}", ""),
      text: matches.length ? `Gefundene Fahrzeuge (${matches.length}):\n${lines.join("\n")}` : "Keine passenden Fahrzeuge in der eingelernten Flotte gefunden.",
      data: { count: matches.length },
    };
  }

  throw new ToolError(`Unbekanntes Werkzeug ${name}`);
}

module.exports = { TOOL_DEFINITIONS, runTool, estimatePrice, priceFactFor, ToolError };
