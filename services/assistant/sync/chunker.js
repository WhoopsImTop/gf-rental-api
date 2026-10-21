"use strict";

const config = require("../config");
const { markdownToText } = require("./extractors/markdown");
const { sha256, slugify, normalizeForHash, relativePath, formatDateDe } = require("../util");

const MIN_CHUNK_CHARS = 350;
const MAX_CHUNK_CHARS = 2200;

const LOCATION_SLUG_RE = /^(carsharing-(in|im)-|standort-)/;

function authorityFor(doc) {
  if (doc.source.type === "post") return 4;
  if (doc.source.type === "vehicle") return 2;
  if (doc.extracted.prices) return 1;
  const path = relativePath(doc.source.url, config.SITE_BASE);
  for (const [prefix, authority] of Object.entries(config.AUTHORITY_BY_SLUG)) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return authority;
  }
  return 3;
}

function regionsOf(text) {
  return config.REGIONS.filter((region) => new RegExp(`\\b${region}\\b`, "i").test(text));
}

function textFragmentUrl(url, text) {
  if (!text) return url;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 80);
  return `${url.split("#")[0]}#:~:text=${encodeURIComponent(clean)}`;
}

function anchoredUrl(url, anchor, heading) {
  if (anchor) return `${url.split("#")[0]}#${anchor}`;
  return textFragmentUrl(url, heading);
}

function filesIn(markdown, files) {
  return (files || [])
    .filter((file) => markdown.includes(file.url))
    .map((file) => ({ type: "file", url: file.url, title: file.label }));
}

/** Teilt zu lange Texte an Absätzen; Tabellen werden zeilenweise mit wiederholtem Kopf geteilt. */
function splitLong(markdown) {
  if (markdown.length <= MAX_CHUNK_CHARS) return [markdown];
  const blocks = [];
  for (const paragraph of markdown.split(/\n{2,}/)) {
    if (paragraph.length <= MAX_CHUNK_CHARS) {
      blocks.push(paragraph);
      continue;
    }
    const lines = paragraph.split("\n");
    const isTable = lines[0]?.startsWith("|") && /^\|\s*-{3}/.test(lines[1] || "");
    const head = isTable ? lines.slice(0, 2) : [];
    let buffer = [...head];
    for (const line of lines.slice(head.length)) {
      if (buffer.join("\n").length + line.length > MAX_CHUNK_CHARS && buffer.length > head.length) {
        blocks.push(buffer.join("\n"));
        buffer = [...head];
      }
      buffer.push(line);
    }
    if (buffer.length > head.length) blocks.push(buffer.join("\n"));
  }

  const parts = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Fasst kleine, benachbarte Abschnitte mit gleichem Elternpfad zusammen. */
function mergeSections(units) {
  const merged = [];
  for (const unit of units) {
    const parentKey = unit.headingPath.slice(0, -1).join(" › ");
    const last = merged[merged.length - 1];
    const body = unit.heading && last ? `**${unit.heading}**\n\n${unit.markdown}` : unit.markdown;
    if (
      last &&
      last.parentKey === parentKey &&
      (last.markdown.length < MIN_CHUNK_CHARS || unit.markdown.length < MIN_CHUNK_CHARS) &&
      last.markdown.length + body.length < MAX_CHUNK_CHARS
    ) {
      if (!last.mergedHeadings) {
        last.markdown = last.heading ? `**${last.heading}**\n\n${last.markdown}` : last.markdown;
        last.mergedHeadings = true;
      }
      last.markdown = `${last.markdown}\n\n${body}`;
      last.heading = unit.headingPath[unit.headingPath.length - 2] || last.heading;
      last.headingPath = unit.headingPath.slice(0, -1);
      continue;
    }
    merged.push({ ...unit, parentKey });
  }
  return merged;
}

function cleanBreadcrumb(items) {
  const out = [];
  for (const item of items) {
    const text = String(item || "").trim();
    if (!text || text === "Grüne Flotte Carsharing" || text === "Die Grüne Flotte") continue;
    if (out[out.length - 1] !== text) out.push(text);
  }
  return out;
}

function finalizeChunk(chunk) {
  const keywords = chunk.keywords || [];
  const plain = markdownToText(chunk.content);
  const embedText = [
    chunk.breadcrumb.join(" › "),
    chunk.question ? `Frage: ${chunk.question}` : null,
    chunk.question ? `Antwort: ${plain}` : plain,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    status: "active",
    valid_from: null,
    valid_until: null,
    published_at: null,
    region: [],
    media: [],
    trust: "html",
    section: null,
    question: null,
    ...chunk,
    keywords,
    embed_text: embedText,
    search_text: [chunk.title, chunk.section, chunk.question, plain, keywords.join(" ")].filter(Boolean).join(" "),
    content_hash: sha256(`${config.EMBEDDING_MODEL}\n${embedText}`),
  };
}

function formatEuro(value) {
  if (value == null) return "–";
  return `${Number(value).toLocaleString("de-DE", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

/** Erzeugt lesbare Fakten-Chunks aus einer Preisversion (Zahlen 1:1 aus den Preisdaten). */
function priceChunks(version) {
  const prices = version.prices;
  const tariff = prices?.tariffs?.green;
  if (!tariff) return [];
  const classes = prices.classes.length ? prices.classes : Object.keys(tariff.time[0]?.values || {});
  const validity = version.validFrom ? ` (gültig ab ${formatDateDe(version.validFrom)}${version.validUntil ? ` bis ${formatDateDe(version.validUntil)}` : ""})` : "";
  const base = {
    kind: "price_fact",
    source_key: version.sourceKey,
    title: version.label,
    authority: 1,
    trust: "structured",
    valid_from: version.validFrom,
    valid_until: version.validUntil,
    source_url: `${version.url.split("#")[0]}#mietpreise`,
    breadcrumb: ["Tarife & Mietpreise", version.label],
  };

  const rows = [...tariff.time, ...tariff.km];
  const table = [
    `| Preis | ${classes.join(" | ")} |`,
    `| --- | ${classes.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.title} | ${classes.map((cls) => formatEuro(row.values[cls])).join(" | ")} |`),
  ].join("\n");

  const notes = [];
  if (prices.calculatorLogic?.verified) {
    notes.push(
      "Diese Grundpreise gelten für alle Karten. Goldene Karte: 10 % Rabatt auf den Zeitpreis. Schwarze Karte: 10 % Rabatt auf Zeit- und Kilometerpreis.",
      "Abgerechnet wird automatisch die günstigste Kombination aus Stunden-, Tages- und Wochenpreisen; Stundenkosten eines Tages sind auf den Tagespreis begrenzt.",
    );
  }
  if (prices.fuelSurcharge && !prices.fuelSurcharge.isPercent) {
    notes.push(`Kraftstoffzuschlag laut Preisrechner: ${formatEuro(prices.fuelSurcharge.value)} pro Kilometer.`);
  }

  const chunks = [
    {
      ...base,
      chunk_id: `price:${slugify(version.label)}:table`,
      section: "Mietpreise je Fahrzeugklasse",
      content: `Mietpreise der Grünen Flotte${validity} je Fahrzeugklasse:\n\n${table}\n\n${notes.join("\n\n")}`.trim(),
    },
  ];

  for (const cls of classes) {
    const lines = rows.map((row) => `- ${row.title}: ${formatEuro(row.values[cls])}`);
    chunks.push({
      ...base,
      chunk_id: `price:${slugify(version.label)}:class-${slugify(cls)}`,
      section: `Fahrzeugklasse ${cls}`,
      content: `Mietpreise Fahrzeugklasse ${cls}${validity}:\n\n${lines.join("\n")}`,
    });
  }
  return chunks;
}

function videoChunks(docs, docsBySlugPath) {
  const videos = new Map();
  for (const doc of docs) {
    for (const video of doc.extracted.videos || []) {
      if (!videos.has(video.src)) videos.set(video.src, { ...video, foundOn: doc });
    }
  }

  return [...videos.values()].map((video) => {
    const file = video.src.split("/").pop();
    const entry = config.VIDEO_CATALOG[file];
    const page = (entry && docsBySlugPath.get(entry.page)) || video.foundOn;
    const title = entry?.title || `Video: ${file.replace(/\.mp4$/i, "").replace(/[-_]/g, " ")}`;
    return {
      kind: "video",
      chunk_id: `video:${slugify(file)}`,
      source_key: page.source.source_key,
      document_id: page.documentId,
      title,
      section: page.source.title,
      breadcrumb: cleanBreadcrumb([...page.source.breadcrumb, title]),
      content: `${title} – Erklärvideo der Grünen Flotte auf der Seite „${page.source.title}“.`,
      source_url: page.source.url,
      authority: 2,
      media: [{ type: "video", src: video.src, poster: video.poster, title }],
    };
  });
}

/**
 * Baut aus allen extrahierten Dokumenten die Chunks einer Index-Version.
 * @param {Array<{source, extracted, documentId, pageText}>} docs
 * @param {Array} priceVersions aus buildPriceVersions()
 */
function buildChunks(docs, priceVersions) {
  const chunks = [];
  const priceBySource = new Map(priceVersions.map((version) => [version.sourceKey, version]));

  // Boilerplate: identische Blöcke auf vielen Seiten nur einmal (beim ersten Vorkommen) einlernen.
  const occurrences = new Map();
  const blockKey = (heading, markdown) => normalizeForHash(`${heading || ""} ${markdown}`);
  for (const doc of docs) {
    const seenInDoc = new Set();
    const items = [
      ...(doc.extracted.sections || []).filter((s) => s.markdown).map((s) => blockKey(s.heading, s.markdown)),
      ...(doc.extracted.toggles || []).map((t) => blockKey(t.title, t.body)),
    ];
    for (const key of items) {
      if (seenInDoc.has(key)) continue;
      seenInDoc.add(key);
      occurrences.set(key, (occurrences.get(key) || 0) + 1);
    }
  }
  const emittedShared = new Set();
  const classify = (key) => {
    if ((occurrences.get(key) || 0) < config.BOILERPLATE_MIN_PAGES) return "own";
    if (emittedShared.has(key)) return "skip";
    emittedShared.add(key);
    return "shared";
  };

  for (const doc of docs) {
    const { source, extracted } = doc;
    const authority = authorityFor(doc);
    const priceVersion = priceBySource.get(source.source_key);
    const isLocation = source.type === "page" && LOCATION_SLUG_RE.test(source.slug || "");
    const baseKind = source.type === "post" ? "news" : source.type === "vehicle" ? "vehicle" : isLocation ? "location" : "section";
    const newsPrefix = source.type === "post" && source.published_at ? `*Meldung vom ${formatDateDe(source.published_at)}*\n\n` : "";
    const common = {
      source_key: source.source_key,
      document_id: doc.documentId,
      title: source.title,
      authority,
      valid_from: priceVersion?.validFrom || null,
      valid_until: priceVersion?.validUntil || null,
      published_at: source.published_at || null,
      region: isLocation ? regionsOf(source.title) : [],
    };
    const usedIds = new Map();
    const uniqueId = (base) => {
      const count = usedIds.get(base) || 0;
      usedIds.set(base, count + 1);
      return count ? `${base}:${count + 1}` : base;
    };

    // FAQ
    for (const faq of extracted.faqs || []) {
      chunks.push({
        ...common,
        kind: "faq",
        chunk_id: uniqueId(`${source.source_key}:faq:${slugify(faq.category, 30)}:${slugify(faq.question)}`),
        title: "FAQ",
        section: faq.category,
        question: faq.question,
        content: faq.answer,
        keywords: faq.keywords,
        breadcrumb: ["FAQ", faq.category],
        source_url: anchoredUrl(source.url, faq.anchor, faq.category),
      });
    }

    // Toggles (Frage/Antwort)
    for (const toggle of extracted.toggles || []) {
      const mode = classify(blockKey(toggle.title, toggle.body));
      if (mode === "skip") continue;
      chunks.push({
        ...common,
        kind: mode === "shared" ? "shared_block" : "faq",
        chunk_id: uniqueId(`${source.source_key}:toggle:${slugify(toggle.title)}`),
        question: toggle.title,
        section: toggle.title,
        content: `${newsPrefix}${toggle.body}`,
        breadcrumb: cleanBreadcrumb([...source.breadcrumb, toggle.title]),
        source_url: textFragmentUrl(source.url, toggle.title),
        media: filesIn(toggle.body, extracted.files),
      });
    }

    // Fließtext-Abschnitte
    const units = [];
    const shared = [];
    for (const section of extracted.sections || []) {
      if (!section.markdown || markdownToText(section.markdown).length < 15) continue;
      const mode = classify(blockKey(section.heading, section.markdown));
      if (mode === "skip") continue;
      (mode === "shared" ? shared : units).push(section);
    }

    const emit = (unit, kind) => {
      const parts = splitLong(unit.markdown);
      parts.forEach((part, index) => {
        const sectionName = unit.heading || unit.headingPath[unit.headingPath.length - 1] || null;
        chunks.push({
          ...common,
          kind,
          chunk_id: uniqueId(`${source.source_key}:${kind}:${slugify(unit.headingPath.join(" ")) || "intro"}${parts.length > 1 ? `:${index + 1}` : ""}`),
          section: sectionName,
          content: `${kind === "news" ? newsPrefix : ""}${part}`,
          breadcrumb: cleanBreadcrumb([...source.breadcrumb, ...unit.headingPath]),
          source_url: anchoredUrl(source.url, unit.anchor, sectionName),
          media: [...filesIn(part, extracted.files), ...(kind === "vehicle" && index === 0 ? extracted.vehicleVideos || [] : [])],
        });
      });
    };

    mergeSections(units).forEach((unit) => emit(unit, baseKind));
    mergeSections(shared).forEach((unit) => emit(unit, "shared_block"));
  }

  for (const version of priceVersions) chunks.push(...priceChunks(version));

  const docsBySlugPath = new Map(
    docs
      .filter((doc) => doc.source.type === "page")
      .map((doc) => [relativePath(doc.source.url, config.SITE_BASE), doc]),
  );
  chunks.push(...videoChunks(docs, docsBySlugPath));

  // Doppelte chunk_ids (z. B. gleiche Preisversion zweimal) verhindern.
  const seen = new Set();
  return chunks.map(finalizeChunk).filter((chunk) => {
    if (seen.has(chunk.chunk_id)) return false;
    seen.add(chunk.chunk_id);
    return true;
  });
}

module.exports = { buildChunks, splitLong, mergeSections, priceChunks, formatEuro };
