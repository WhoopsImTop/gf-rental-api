"use strict";

const config = require("../config");
const { discoverWebsite } = require("./discovery");
const { fetchUrl } = require("./fetcher");
const { extractHtmlPage } = require("./extractors/generic");
const { extractPrices } = require("./extractors/prices");
const { loadVehicles } = require("./extractors/vehicles");
const { markdownToText } = require("./extractors/markdown");
const { buildPriceVersions } = require("./consistency");
const { buildChunks } = require("./chunker");
const { todayIso } = require("../util");

function isIncluded(source, override) {
  if (override === "include") return true;
  if (override === "exclude") return false;
  return !source.excluded_reason;
}

function pageTextOf(extracted) {
  return (extracted.sections || []).map((section) => markdownToText(section.markdown)).join(" ");
}

/**
 * Lädt und extrahiert alle Quellen.
 * @param {object} options
 * @param {"incremental"|"full"} options.mode  incremental: Beiträge mit unverändertem lastmod werden aus previous übernommen
 * @param {Map<string, {lastmod, extracted}>} [options.previous] letzte gespeicherte Extraktion je source_key
 * @param {Map<string, "include"|"exclude">} [options.overrides] manuelle Entscheidungen aus dem CRM
 * @param {object|null} [options.db] Sequelize-Models (für Fahrzeuge); null = Fahrzeuge überspringen
 * @param {(progress: object) => void} [options.onProgress]
 */
async function collectDocuments({ mode = "incremental", previous = new Map(), overrides = new Map(), db = null, onProgress = () => {} }) {
  const errors = [];
  const warnings = [];

  onProgress({ phase: "discovery" });
  const websiteSources = await discoverWebsite();
  if (websiteSources[0]?.discovery_warning) {
    warnings.push({ severity: "warning", code: "discovery_fallback", message: websiteSources[0].discovery_warning });
  }

  const docs = [];
  const allSources = [];
  const toFetch = websiteSources.filter((source) => isIncluded(source, overrides.get(source.source_key)));
  for (const source of websiteSources) {
    if (!toFetch.includes(source)) allSources.push({ ...source, crawled: false });
  }

  let done = 0;
  for (const source of toFetch) {
    onProgress({ phase: "fetch", done, total: toFetch.length, current: source.url });
    done += 1;

    const prior = previous.get(source.source_key);
    const unchanged = prior && prior.lastmod && source.lastmod && new Date(prior.lastmod).getTime() === new Date(source.lastmod).getTime();
    // Seiten werden immer neu geladen (Preise/FAQ ändern sich ohne WP-"modified"), Beiträge nur bei Änderung.
    if (mode === "incremental" && source.type === "post" && unchanged && prior.extracted) {
      docs.push({ source, extracted: prior.extracted, pageText: pageTextOf(prior.extracted), reused: true });
      allSources.push({ ...source, crawled: false });
      continue;
    }

    try {
      const { data: html } = await fetchUrl(source.url);
      const extracted = extractHtmlPage(String(html), { url: source.url });
      const prices = extractPrices(extracted.dataScripts);
      // Nur Seiten mit Preistabelle sind Preisquellen (Beiträge binden teils nur den Rechner ein).
      extracted.prices = source.type === "page" && prices && Object.keys(prices.tariffs).length ? prices : null;
      delete extracted.dataScripts;

      const iframeOnly =
        extracted.iframeCount > 0 &&
        extracted.textLength < config.IFRAME_ONLY_MAX_TEXT &&
        !extracted.faqs.length &&
        !extracted.toggles.length &&
        !extracted.prices;
      if (iframeOnly && overrides.get(source.source_key) !== "include") {
        allSources.push({ ...source, excluded_reason: "iframe_only", crawled: true });
        continue;
      }

      docs.push({ source, extracted, pageText: pageTextOf(extracted), reused: false });
      allSources.push({ ...source, crawled: true });
    } catch (error) {
      errors.push({ source_key: source.source_key, url: source.url, message: error.message });
      allSources.push({ ...source, crawled: false, last_error: error.message });
      if (prior?.extracted) {
        // Letzten bekannten Stand behalten, statt Wissen zu verlieren.
        docs.push({ source, extracted: prior.extracted, pageText: pageTextOf(prior.extracted), reused: true });
      }
    }
  }

  if (db) {
    onProgress({ phase: "vehicles" });
    try {
      for (const vehicle of await loadVehicles(db)) {
        const override = overrides.get(vehicle.source.source_key);
        allSources.push({ ...vehicle.source, crawled: true });
        if (override === "exclude") continue;
        docs.push({ source: vehicle.source, extracted: vehicle.extracted, pageText: pageTextOf(vehicle.extracted), reused: false });
      }
    } catch (error) {
      errors.push({ source_key: "vehicles", url: null, message: `Fahrzeuge konnten nicht geladen werden: ${error.message}` });
    }
  }

  if (errors.length) {
    warnings.push(
      ...errors.map((error) => ({
        severity: "warning",
        code: "fetch_failed",
        source: error.url,
        message: `${error.url || error.source_key}: ${error.message}`,
      })),
    );
  }

  return { sources: allSources, docs, warnings };
}

/** Preisversionen + Chunks + Fakten aus den gesammelten Dokumenten. */
function buildIndexContent(docs, { today = todayIso() } = {}) {
  const priceDocs = docs.filter((doc) => doc.extracted.prices);
  const priceVersions = buildPriceVersions(priceDocs, today);
  const chunks = buildChunks(docs, priceVersions);

  const facts = priceVersions.map((version) => ({
    key: "price_table",
    label: version.label,
    valid_from: version.validFrom,
    valid_until: version.validUntil,
    source_url: `${version.url.split("#")[0]}#mietpreise`,
    data: {
      prices: version.prices,
      consistent: version.consistent,
      estimateEnabled: version.estimateEnabled,
      warnings: version.warnings,
    },
  }));

  const vehicles = docs.filter((doc) => doc.extracted.vehicle).map((doc) => doc.extracted.vehicle);
  if (vehicles.length) {
    facts.push({ key: "vehicles", label: "Fahrzeugflotte", valid_from: null, valid_until: null, source_url: config.VEHICLE_URL_TEMPLATE.replace("{id}", ""), data: { vehicles } });
  }

  const warnings = priceVersions.flatMap((version) => version.warnings);
  if (!priceVersions.length) {
    warnings.push({ severity: "blocker", code: "price_page_missing", message: "Keine Seite mit Preisdaten gefunden." });
  }

  return { chunks, facts, priceVersions, warnings };
}

module.exports = { collectDocuments, buildIndexContent, isIncluded };
