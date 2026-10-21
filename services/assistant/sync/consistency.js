"use strict";

const { addDays, parseValidFrom, formatDateDe } = require("../util");

const ROW_MATCHERS = [
  { label: "Nachtstunde 0–7 Uhr", time: /0\s*-\s*7/, calc: (c, cls) => c.hourly?.[cls]?.night },
  { label: "Stunde 7–24 Uhr", time: /7\s*-\s*24/, calc: (c, cls) => c.hourly?.[cls]?.day },
  { label: "Tagespreis", time: /^tag/i, calc: (c, cls) => c.daily?.[cls] },
  { label: "Wochenpreis", time: /^woche/i, calc: (c, cls) => c.weekly?.[cls] },
  { label: "km bis 100 km", km: /bis\s*100/, calc: (c, cls) => c.km?.upTo100?.[cls] },
  { label: "km ab 101 km", km: /ab\s*101/, calc: (c, cls) => c.km?.above100?.[cls] },
];

/**
 * Vergleicht die angezeigte Preistabelle mit den Werten im Website-Preisrechner
 * und den Kraftstoffzuschlag im Text mit dem Wert im Skript.
 * @returns {{code: string, message: string}[]}
 */
function checkPriceConsistency(prices, pageText = "") {
  const issues = [];
  if (!prices) return issues;

  const tariff = prices.tariffs?.green || Object.values(prices.tariffs || {})[0];
  const calc = prices.calculator;

  if (!tariff) issues.push({ code: "price_table_missing", message: "Preistabelle (const tables) nicht gefunden." });
  if (!calc) issues.push({ code: "price_calculator_missing", message: "Preisrechner-Daten (basisTarif) nicht gefunden." });

  if (tariff && calc) {
    for (const matcher of ROW_MATCHERS) {
      const rows = matcher.time ? tariff.time : tariff.km;
      const row = (rows || []).find((entry) => (matcher.time || matcher.km).test(entry.title));
      if (!row) {
        issues.push({ code: "price_row_missing", message: `Zeile „${matcher.label}“ fehlt in der Preistabelle.` });
        continue;
      }
      for (const [cls, shown] of Object.entries(row.values)) {
        const calculated = matcher.calc(calc, cls);
        if (calculated == null || shown == null || Math.abs(Number(calculated) - Number(shown)) > 0.001) {
          issues.push({
            code: "price_mismatch",
            message: `${matcher.label} Klasse ${cls}: Tabelle ${shown ?? "–"} € ≠ Preisrechner ${calculated ?? "–"} €`,
          });
        }
      }
    }

    // Alle Tarife müssen dieselben Grundpreise zeigen (Rabatte werden prozentual gerechnet).
    for (const [name, other] of Object.entries(prices.tariffs || {})) {
      if (JSON.stringify(other) !== JSON.stringify(tariff)) {
        issues.push({ code: "price_tariff_tables_differ", message: `Grundpreistabelle für Tarif „${name}“ weicht vom Tarif Grün ab.` });
      }
    }
  }

  if (!prices.calculatorLogic?.verified) {
    const failed = Object.entries(prices.calculatorLogic?.checks || {})
      .filter(([, ok]) => !ok)
      .map(([name]) => name);
    issues.push({
      code: "calculator_logic_changed",
      message: `Rechenlogik des Website-Preisrechners hat sich geändert (${failed.join(", ") || "nicht gefunden"}) – Preisschätzung deaktiviert.`,
    });
  }

  const textCent = String(pageText).match(/aktuell\s+(\d+(?:,\d+)?)\s*Cent\s+pro\s+Kilometer/i);
  if (textCent) {
    const textValue = Number(textCent[1].replace(",", ".")) / 100;
    if (!prices.fuelSurcharge) {
      issues.push({ code: "fuel_surcharge_script_missing", message: `Kraftstoffzuschlag im Text (${textCent[1]} Cent/km), aber nicht im Preisrechner hinterlegt.` });
    } else if (!prices.fuelSurcharge.isPercent && Math.abs(prices.fuelSurcharge.value - textValue) > 0.0001) {
      issues.push({
        code: "fuel_surcharge_mismatch",
        message: `Kraftstoffzuschlag: Text ${textCent[1]} Cent/km ≠ Preisrechner ${(prices.fuelSurcharge.value * 100).toFixed(1)} Cent/km`,
      });
    }
  }

  return issues;
}

/**
 * Bildet aus allen Seiten mit Preisdaten Preisversionen mit Gültigkeitszeitraum.
 * "ab Juni 2026" gilt bis zum Tag vor der nächsten Version ("ab Oktober 2026").
 * Inkonsistenzen in aktuell oder künftig gültigen Versionen sind Blocker.
 */
function buildPriceVersions(priceDocs, today) {
  const versions = priceDocs
    .map((doc) => ({
      sourceKey: doc.source.source_key,
      url: doc.source.url,
      label: doc.extracted.htmlTitle?.split(" - ")[0] || doc.source.title,
      validFrom: parseValidFrom(doc.source.title) || parseValidFrom(doc.extracted.htmlTitle),
      prices: doc.extracted.prices,
      issues: checkPriceConsistency(doc.extracted.prices, doc.pageText),
    }))
    .sort((a, b) => String(a.validFrom || "").localeCompare(String(b.validFrom || "")));

  versions.forEach((version, i) => {
    const next = versions.slice(i + 1).find((candidate) => candidate.validFrom && candidate.validFrom !== version.validFrom);
    version.validUntil = next && version.validFrom ? addDays(next.validFrom, -1) : null;
    const relevant = !version.validUntil || version.validUntil >= today;
    version.consistent = version.issues.filter((issue) => issue.code !== "calculator_logic_changed").length === 0;
    version.estimateEnabled = Boolean(version.prices?.calculatorLogic?.verified) && version.consistent;
    version.warnings = version.issues.map((issue) => ({
      severity: relevant && issue.code.startsWith("price_") ? "blocker" : "warning",
      code: issue.code,
      source: version.url,
      message: `${version.label}${version.validFrom ? ` (gültig ab ${formatDateDe(version.validFrom)})` : ""}: ${issue.message}`,
    }));
  });

  return versions;
}

module.exports = { checkPriceConsistency, buildPriceVersions };
