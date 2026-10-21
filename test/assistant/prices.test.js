// Website-Rechner rechnet in Browser-Ortszeit (Deutschland)
process.env.TZ = "Europe/Berlin";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const { extractPrices } = require("../../services/assistant/sync/extractors/prices");
const { checkPriceConsistency, buildPriceVersions } = require("../../services/assistant/sync/consistency");
const { estimatePrice } = require("../../services/assistant/chat/tools");

// Inline-Skripte der Seite "Unsere Mietpreise ab Oktober 2026" (Stand 08.10.2026)
const scripts = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/price-scripts-oktober-2026.json"), "utf8"));
const prices = extractPrices(scripts);

test("extractPrices liest Preistabelle, Preisrechner und Kraftstoffzuschlag aus dem Inline-JS", () => {
  assert.deepEqual(prices.classes, ["XS", "S", "M", "L", "XL", "XXL"]);
  const day = prices.tariffs.green.time.find((row) => row.title === "7-24 Uhr");
  assert.equal(day.values.XS, 1.8);
  assert.equal(day.values.XXL, 5);
  assert.equal(prices.calculator.weekly.XXL, 405);
  assert.equal(prices.calculator.km.above100.M, 0.33);
  assert.deepEqual(prices.fuelSurcharge, { value: 0.05, isPercent: false });
  assert.equal(prices.promo, null);
  assert.equal(prices.calculatorLogic.verified, true);
  // auskommentierte Aktionsspalte ("4 für 3") darf nicht als Preiszeile auftauchen
  assert.ok(!prices.tariffs.green.time.some((row) => /aktion/i.test(row.title)));
});

test("checkPriceConsistency meldet Abweichungen zwischen Tabelle und Preisrechner", () => {
  assert.deepEqual(checkPriceConsistency(prices, "beträgt der Aufschlag aktuell 5 Cent pro Kilometer"), []);

  const broken = structuredClone(prices);
  broken.calculator.daily.XXL = 82;
  const issues = checkPriceConsistency(broken, "");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "price_mismatch");
  assert.match(issues[0].message, /Tagespreis Klasse XXL: Tabelle 80 € ≠ Preisrechner 82 €/);

  const fuel = checkPriceConsistency(prices, "beträgt der Aufschlag aktuell 7 Cent pro Kilometer");
  assert.equal(fuel[0].code, "fuel_surcharge_mismatch");
});

test("buildPriceVersions verkettet Gültigkeiten und stuft nur aktuelle Versionen als Blocker ein", () => {
  const broken = structuredClone(prices);
  broken.calculator.daily.XXL = 82;
  const doc = (key, title, extractedPrices) => ({
    source: { source_key: key, url: `https://gruene-flotte.com/carsharing/${key}/`, title },
    extracted: { htmlTitle: `${title} - Grüne Flotte Carsharing`, prices: extractedPrices },
    pageText: "",
  });
  const versions = buildPriceVersions(
    [doc("okt", "Unsere Mietpreise ab Oktober 2026", prices), doc("juni", "Unsere Mietpreise ab Juni 2026", broken)],
    "2026-10-08",
  );
  assert.equal(versions[0].validFrom, "2026-06-01");
  assert.equal(versions[0].validUntil, "2026-09-30");
  assert.equal(versions[1].validFrom, "2026-10-01");
  assert.equal(versions[1].validUntil, null);
  assert.equal(versions[0].consistent, false);
  assert.ok(versions[0].warnings.every((warning) => warning.severity === "warning"), "abgelaufene Version blockiert nicht");
  assert.equal(versions[1].consistent, true);
  assert.equal(versions[1].estimateEnabled, true);
});

/** Original-Preisrechner der Website in einer Sandbox ausführen. */
function websiteCalculator(promo) {
  const code = scripts.find((script) => script.includes("function berechneMietpreis"));
  const pick = (name) => {
    const start = code.indexOf(`function ${name}`);
    let depth = 0;
    for (let i = code.indexOf("{", start); i < code.length; i += 1) {
      if (code[i] === "{") depth += 1;
      if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
    }
    throw new Error(`${name} nicht gefunden`);
  };
  const context = vm.createContext({
    kraftstoffzuschlag: prices.fuelSurcharge,
    gfRechnerAktion: promo,
    Date,
    Math,
  });
  vm.runInContext(`${pick("aktionGiltFuer")}\n${pick("berechneMietpreis")}\nthis.berechneMietpreis = berechneMietpreis;`, context);
  return context.berechneMietpreis;
}

function randomBookings(count) {
  // deterministischer Zufall; Zeitraum ohne Sommerzeitwechsel (Nov 2026 – Mär 2027)
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pad = (n) => String(n).padStart(2, "0");
  const bookings = [];
  for (let i = 0; i < count; i += 1) {
    const start = new Date(2026, 10, 2 + Math.floor(rnd() * 100), Math.floor(rnd() * 24), rnd() < 0.5 ? 0 : 30);
    const durationMinutes = [30, 90, 240, 600, 1500, 2900, 4400, 5800, 7000, 9000, 10080, 12000, 20160, 25000][Math.floor(rnd() * 14)];
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    bookings.push({
      start,
      end,
      startLocal: local(start),
      endLocal: local(end),
      vehicleClass: prices.classes[Math.floor(rnd() * prices.classes.length)],
      tariff: ["green", "gold", "black"][Math.floor(rnd() * 3)],
      km: [0, 15, 99, 100, 101, 250, 800][Math.floor(rnd() * 7)],
      includeCredit: rnd() < 0.5,
    });
  }
  return bookings;
}

for (const [label, promo, today] of [
  ["ohne Aktion", { aktiv: false }, "2026-10-08"],
  ["mit Aktion 4 für 3", { aktiv: true, von: "2026-01-01", bis: "2027-12-31" }, new Date().toISOString().slice(0, 10)],
]) {
  test(`estimate_price rechnet identisch zum Website-Preisrechner (${label})`, () => {
    const website = websiteCalculator(promo);
    const withPromo = { ...prices, promo };
    for (const booking of randomBookings(400)) {
      const membership = `${booking.tariff}_membership`;
      const expected = website(membership, booking.vehicleClass, booking.start, booking.end, booking.km, booking.includeCredit);
      const actual = estimatePrice(withPromo, {
        vehicleClass: booking.vehicleClass,
        tariff: booking.tariff,
        start: booking.startLocal,
        end: booking.endLocal,
        km: booking.km,
        includeCredit: booking.includeCredit,
        today,
      });
      const context = JSON.stringify(booking);
      assert.equal(actual.total, Math.round(expected.gesamtPreis * 100) / 100, context);
      assert.equal(actual.timePrice, Math.round(expected.zeitPreis * 100) / 100, context);
      assert.equal(actual.promoActive, expected.promoAktiv, context);
    }
  });
}

test("estimate_price validiert Eingaben", () => {
  const base = { vehicleClass: "M", tariff: "green", start: "2026-11-02T10:00", end: "2026-11-02T12:00", km: 20, today: "2026-10-08" };
  assert.throws(() => estimatePrice(prices, { ...base, vehicleClass: "XXXL" }), /Unbekannte Fahrzeugklasse/);
  assert.throws(() => estimatePrice(prices, { ...base, end: "2026-11-02T09:00" }), /nach start/);
  assert.throws(() => estimatePrice(prices, { ...base, start: "morgen" }), /Format/);
  const result = estimatePrice(prices, base);
  // 2 Stunden à 2,90 € + 20 km à (0,36 € + 0,05 € Kraftstoffzuschlag)
  assert.equal(result.total, 14);
});
