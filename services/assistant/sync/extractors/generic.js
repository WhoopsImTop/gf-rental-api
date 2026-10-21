"use strict";

const cheerio = require("cheerio");
const { htmlToMarkdown, markdownToText } = require("./markdown");
const { extractFaqs } = require("./faq");
const { extractToggles } = require("./toggles");
const { normalizeForHash } = require("../../util");

const ROOT_SELECTORS = ["#main-content", "#et-main-area", "article", "body"];

/** Alles, was kein Wissen ist: Navigation, Widgets, Formulare, Kalkulator-UI, leere JS-Tabellen. */
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "form",
  "#main-header",
  "#main-footer",
  ".et-l--header",
  ".et-l--footer",
  "#gf-schnellaktionen",
  "#gf_mobile_nav",
  "[class*='cookie']",
  "[id*='cookie']",
  "[class*='borlabs']",
  ".et_pb_fullwidth_header_scroll",
  ".et_pb_video_slider",
  ".et_pb_video",
  ".et_pb_slider_controls",
  ".price-calculator",
  ".price-table-wrapper",
  ".gf-switch-group",
  ".gf-price-table-legend",
  ".gf-price-table-mobile-swipe-notice",
  ".gf-custom-how-it-works-wrapper",
  ".et_pb_newsletter",
  ".et_pb_contact_form_container",
  ".gf-like-and-review-bg",
  // Kostenvergleich "Carsharing vs. eigenes Auto": interaktiver Rechner mit Beispielwerten
  "#carsharing-im-vergleich table",
];

/** IDs, die keine sinnvollen Sprunganker sind. */
const LAYOUT_IDS = new Set(["main-content", "et-main-area", "page-container", "et-boc", "left-area", "content-area"]);

function isUsableAnchor(id) {
  return Boolean(id) && /^[\w-]{1,80}$/.test(id) && !LAYOUT_IDS.has(id) && !/^post-\d+$/.test(id);
}

const DATA_SCRIPT_RE = /const\s+tables\s*=|function\s+berechneMietpreis|const\s+kraftstoffzuschlag\s*=/;

function absolutize($, root, baseUrl) {
  const fix = (el, attr) => {
    const value = $(el).attr(attr);
    if (!value || /^(mailto:|tel:|#|javascript:|data:)/i.test(value)) return;
    try {
      $(el).attr(attr, new URL(value, baseUrl).toString());
    } catch {
      // ungültige URL bleibt unverändert
    }
  };
  root.find("a[href]").each((_, el) => fix(el, "href"));
  root.find("source[src], video[src], img[src]").each((_, el) => fix(el, "src"));
}

function collectVideos($, root) {
  const videos = new Map();
  root.find("video source[src], video[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || videos.has(src)) return;
    const slide = $(el).closest("[data-image]");
    videos.set(src, { src, poster: slide.attr("data-image") || $(el).closest("video").attr("poster") || null });
  });
  return [...videos.values()];
}

function collectFiles($, root) {
  const files = new Map();
  root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!/\.pdf(\?|#|$)/i.test(href || "") || files.has(href)) return;
    files.set(href, { url: href, label: $(el).text().replace(/\s+/g, " ").trim() || href.split("/").pop() });
  });
  return [...files.values()];
}

function setHeadingAnchors($, root) {
  root.find("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const heading = $(el);
    let anchor = heading.attr("id");
    if (!anchor) {
      const holder = heading
        .parents("[id]")
        .filter((__, parent) => isUsableAnchor($(parent).attr("id")))
        .first();
      anchor = holder.attr("id");
    }
    if (isUsableAnchor(anchor)) heading.attr("data-anchor", anchor);
  });
}

const HEADING_RE = /^(#{1,6})\s+(.*?)(?:\s+\{#([\w-]+)\})?\s*$/;

/** Zerlegt Markdown entlang der Überschriften; jede Sektion kennt ihren Überschriftenpfad. */
function splitSections(markdown) {
  const sections = [];
  const stack = [];
  let current = { headingPath: [], heading: null, anchor: null, lines: [] };

  const flush = () => {
    const body = current.lines.join("\n").trim();
    if (body || current.heading) {
      sections.push({
        headingPath: [...current.headingPath],
        heading: current.heading,
        anchor: current.anchor,
        markdown: body,
      });
    }
  };

  for (const line of markdown.split("\n")) {
    const match = line.match(HEADING_RE);
    if (!match) {
      current.lines.push(line);
      continue;
    }
    flush();
    const level = match[1].length;
    const text = match[2].trim();
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const inheritedAnchor = [...stack].reverse().find((entry) => entry.anchor)?.anchor || null;
    stack.push({ level, text, anchor: match[3] || null });
    current = {
      headingPath: stack.map((entry) => entry.text),
      heading: text,
      anchor: match[3] || inheritedAnchor,
      lines: [],
    };
  }
  flush();
  return sections;
}

/**
 * Extrahiert eine gerenderte Divi-Seite.
 * Ergebnis ist JSON-serialisierbar und wird als kb_documents.extracted gespeichert.
 */
function extractHtmlPage(html, { url }) {
  const $ = cheerio.load(html);
  const robots = $('meta[name="robots"]').attr("content") || null;
  const htmlTitle = $("title").first().text().trim();

  const dataScripts = $("script:not([src])")
    .map((_, el) => $(el).html())
    .get()
    .filter((code) => code && DATA_SCRIPT_RE.test(code));

  const root = ROOT_SELECTORS.map((selector) => $(selector).first()).find((el) => el.length);
  absolutize($, root, url);

  const videos = collectVideos($, root);
  const files = collectFiles($, root);
  const iframeCount = root.find("iframe").length;

  const faqs = extractFaqs($, root);
  const toggles = extractToggles($, root);

  root.find(NOISE_SELECTORS.join(",")).remove();
  setHeadingAnchors($, root);

  const markdown = htmlToMarkdown($.html(root));

  const seen = new Set();
  const sections = splitSections(markdown).filter((section) => {
    const key = normalizeForHash(`${section.heading || ""} ${section.markdown}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const textLength = markdownToText(markdown).length;

  return {
    htmlTitle,
    robots,
    sections,
    faqs,
    toggles,
    videos,
    files,
    iframeCount,
    textLength,
    dataScripts,
  };
}

/** Gesamter Dokumenttext als Markdown (für Diff-Ansicht und Content-Hash). */
function documentMarkdown(extracted) {
  const parts = [];
  for (const section of extracted.sections || []) {
    if (section.heading) parts.push(`${"#".repeat(Math.min(section.headingPath.length || 2, 6))} ${section.heading}`);
    if (section.markdown) parts.push(section.markdown);
  }
  for (const faq of extracted.faqs || []) {
    parts.push(`### FAQ · ${faq.category}: ${faq.question}`, faq.answer);
  }
  for (const toggle of extracted.toggles || []) {
    parts.push(`### ${toggle.title}`, toggle.body);
  }
  if (extracted.prices) {
    parts.push("### Preisdaten (strukturiert)", "```json", JSON.stringify(extracted.prices, null, 2), "```");
  }
  for (const video of extracted.videos || []) parts.push(`- Video: ${video.src}`);
  for (const file of extracted.files || []) parts.push(`- Datei: [${file.label}](${file.url})`);
  return parts.join("\n\n").trim();
}

module.exports = { extractHtmlPage, splitSections, documentMarkdown };
