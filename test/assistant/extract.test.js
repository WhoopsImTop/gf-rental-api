const test = require("node:test");
const assert = require("node:assert/strict");

const { extractHtmlPage, splitSections } = require("../../services/assistant/sync/extractors/generic");
const { buildChunks, splitLong } = require("../../services/assistant/sync/chunker");
const { diffLines } = require("../../services/assistant/diff");
const { parseValidFrom } = require("../../services/assistant/util");

const page = (inner) => `<!DOCTYPE html><html><head><title>Testseite - Grüne Flotte Carsharing</title>
<meta name="robots" content="index, follow"></head><body><div id="page-container">
<header id="main-header"><nav><a href="/carsharing/">Navigation</a></nav></header>
<div id="et-main-area"><div id="main-content"><article id="post-1">${inner}</article></div>
<footer id="main-footer">Footer-Text</footer></div></div>
<div id="gf-schnellaktionen">SCHNELLAKTIONEN</div><script>var x = 1;</script></body></html>`;

test("FAQ-Modul wird als Frage/Antwort mit Kategorie und Keywords extrahiert", () => {
  const html = page(`<div class="custom-faq-wrapper"><div class="header-container"><input id="faq-search"></div>
    <div class="custom-faq-category"><h3 class="custom-faq-category-title" id="Registrieren">Registrieren</h3>
      <div class="custom-faq-category-content">
        <div class="custom-faq-item" id="Führerschein Klasse B, BF17"><h5 class="custom-faq-item-title">1. Welchen Führerschein brauche ich?</h5>
          <div class="custom-faq-item-content"><p>Sie benötigen die <strong>Klasse B</strong>.</p></div></div>
      </div></div></div>`);
  const result = extractHtmlPage(html, { url: "https://gruene-flotte.com/carsharing/faqs/" });
  assert.equal(result.faqs.length, 1);
  assert.deepEqual(result.faqs[0], {
    category: "Registrieren",
    anchor: "Registrieren",
    question: "Welchen Führerschein brauche ich?",
    answer: "Sie benötigen die **Klasse B**.",
    keywords: ["Führerschein Klasse B", "BF17"],
  });
  // FAQ nicht zusätzlich als Fließtext, Navigation/Footer/Widgets entfernt
  const text = JSON.stringify(result.sections);
  assert.ok(!text.includes("Führerschein"));
  assert.ok(!text.includes("Footer-Text"));
  assert.ok(!text.includes("SCHNELLAKTIONEN"));
});

test("Divi-Toggles werden dedupliziert (Desktop/Mobil-Duplikate)", () => {
  const toggle = `<div class="et_pb_toggle"><h5 class="et_pb_toggle_title">Tanken &amp; Laden</h5><div class="et_pb_toggle_content"><p>Tankkarte im Handschuhfach.</p></div></div>`;
  const result = extractHtmlPage(page(toggle + toggle), { url: "https://gruene-flotte.com/carsharing/so-geht-carsharing/fahren/" });
  assert.deepEqual(result.toggles, [{ title: "Tanken & Laden", body: "Tankkarte im Handschuhfach." }]);
});

test("Abschnitte behalten Überschriftenpfad, Anker und absolute Links", () => {
  const html = page(`<div class="et_pb_section" id="mietpreise"><h2>Tarife</h2><p>Text A <a href="/carsharing/preisliste/">Preisliste</a></p>
    <h3>Gold</h3><p>10 % Rabatt</p></div><h2>Sonstiges</h2><p>Text B</p>`);
  const result = extractHtmlPage(html, { url: "https://gruene-flotte.com/carsharing/mietpreise/" });
  const gold = result.sections.find((section) => section.heading === "Gold");
  assert.deepEqual(gold.headingPath, ["Tarife", "Gold"]);
  assert.equal(gold.anchor, "mietpreise");
  const tarife = result.sections.find((section) => section.heading === "Tarife");
  assert.match(tarife.markdown, /\[Preisliste\]\(https:\/\/gruene-flotte\.com\/carsharing\/preisliste\/\)/);
  assert.equal(result.sections.find((section) => section.heading === "Sonstiges").anchor, null);
});

test("splitSections ordnet Überschriften hierarchisch", () => {
  const sections = splitSections("# A\n\nx\n\n## B {#b}\n\ny\n\n### C\n\nz\n\n## D\n\nw");
  assert.deepEqual(sections.map((s) => [s.headingPath.join(">"), s.anchor]), [["A", null], ["A>B", "b"], ["A>B>C", "b"], ["A>D", null]]);
});

test("splitLong teilt große Tabellen mit wiederholtem Tabellenkopf", () => {
  const rows = Array.from({ length: 200 }, (_, i) => `| Zeile ${i} | ${"x".repeat(20)} |`);
  const parts = splitLong(["| A | B |", "| --- | --- |", ...rows].join("\n"));
  assert.ok(parts.length > 1);
  for (const part of parts) assert.ok(part.startsWith("| A | B |\n| --- | --- |"));
});

test("buildChunks lernt Boilerplate nur einmal ein und setzt Metadaten", () => {
  const shared = { headingPath: ["Sie haben Fragen?"], heading: "Sie haben Fragen?", anchor: "kundenzentrale", markdown: "Bürozeiten Mo. – Fr. von 8:00 bis 17:00 Uhr" };
  const docs = ["a", "b", "c", "d"].map((slug, i) => ({
    documentId: i + 1,
    source: {
      source_key: `page:${i + 1}`,
      type: "page",
      slug,
      url: `https://gruene-flotte.com/carsharing/${slug}/`,
      title: `Seite ${slug}`,
      breadcrumb: [`Seite ${slug}`],
      published_at: null,
    },
    extracted: {
      sections: [shared, { headingPath: ["Eigenes"], heading: "Eigenes", anchor: null, markdown: `Inhalt nur auf Seite ${slug} mit genug Text für einen eigenen Abschnitt.` }],
      faqs: [],
      toggles: [],
      videos: [],
      files: [],
    },
  }));
  const chunks = buildChunks(docs, []);
  assert.equal(chunks.filter((chunk) => chunk.kind === "shared_block").length, 1);
  assert.equal(chunks.filter((chunk) => chunk.kind === "section").length, 4);
  const sharedChunk = chunks.find((chunk) => chunk.kind === "shared_block");
  assert.equal(sharedChunk.source_url, "https://gruene-flotte.com/carsharing/a/#kundenzentrale");
  assert.ok(sharedChunk.embed_text.startsWith("Seite a › Sie haben Fragen?"));
  assert.equal(new Set(chunks.map((chunk) => chunk.chunk_id)).size, chunks.length);
});

test("parseValidFrom erkennt Monats- und Datumsangaben", () => {
  assert.equal(parseValidFrom("Unsere Mietpreise ab Oktober 2026"), "2026-10-01");
  assert.equal(parseValidFrom("Neue Tarife & Mietpreise ab 01.06.2026"), "2026-06-01");
  assert.equal(parseValidFrom("Preisliste"), null);
});

test("diffLines zeigt Änderungen mit Kontext", () => {
  const before = ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n");
  const after = ["a", "b", "c", "d", "X", "f", "g", "h"].join("\n");
  const lines = diffLines(before, after);
  assert.deepEqual(lines.filter((line) => line.type !== "same" && line.type !== "skip"), [
    { type: "del", text: "e" },
    { type: "add", text: "X" },
  ]);
  assert.equal(lines[0].type, "skip");
});
