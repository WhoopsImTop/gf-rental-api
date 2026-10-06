const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PageBlockValidationError,
  normalizePageBlocks,
  parseVideoUrl,
  sanitizeUrl,
} = require("../../services/carsharingPageBlocks");

test("parseVideoUrl erkennt YouTube- und Vimeo-Varianten", () => {
  const yt = { provider: "youtube", videoId: "dQw4w9WgXcQ" };
  assert.deepEqual(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), yt);
  assert.deepEqual(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ"), yt);
  assert.deepEqual(parseVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ"), yt);
  assert.deepEqual(parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ"), yt);
  assert.deepEqual(parseVideoUrl("https://vimeo.com/76979871"), { provider: "vimeo", videoId: "76979871" });
  assert.deepEqual(parseVideoUrl("https://player.vimeo.com/video/76979871"), { provider: "vimeo", videoId: "76979871" });
  assert.equal(parseVideoUrl("https://evil.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoUrl("javascript:alert(1)"), null);
});

test("sanitizeUrl erlaubt nur sichere Schemata", () => {
  assert.equal(sanitizeUrl("https://gruene-flotte.com/tarife"), "https://gruene-flotte.com/tarife");
  assert.equal(sanitizeUrl("/kontakt"), "/kontakt");
  assert.equal(sanitizeUrl("mailto:info@example.com"), "mailto:info@example.com");
  assert.equal(sanitizeUrl("//evil.example"), null);
  assert.equal(sanitizeUrl("data:text/html,hi"), null);
  assert.equal(sanitizeUrl("vbscript:x"), null);
});

test("normalizePageBlocks bereinigt HTML und verwirft unbekannte Felder", () => {
  const [text, accordion] = normalizePageBlocks([
    { id: "a1", type: "text", body_html: '<p onclick="x()">Hi<script>alert(1)</script></p><img src=x>', extra: 1 },
    { type: "accordion", items: [{ title: " Frage ", body_html: '<a href="https://x.de" target="_blank">x</a>' }] },
  ]);
  assert.deepEqual(text, { id: "a1", type: "text", body_html: "<p>Hi</p>" });
  assert.equal(accordion.items[0].title, "Frage");
  assert.equal(accordion.items[0].body_html, '<a href="https://x.de" target="_blank" rel="noopener noreferrer">x</a>');
  assert.match(accordion.id, /^[0-9a-f-]{36}$/);
});

test("normalizePageBlocks normalisiert Button, Links, Bild und Video", () => {
  const blocks = normalizePageBlocks([
    { type: "button", label: "Buchen", url: "https://buchen.de", style: "fancy" },
    { type: "links", items: [{ label: "Tarife", url: "/tarife", newTab: "yes" }] },
    { type: "image", mediaId: "12", alt: "Front", url: "https://ignored" },
    { type: "video", url: "https://youtu.be/dQw4w9WgXcQ", title: "Tour" },
  ]);
  assert.equal(blocks[0].style, "primary");
  assert.deepEqual(blocks[1].items, [{ label: "Tarife", url: "/tarife", newTab: false }]);
  assert.equal(blocks[2].mediaId, 12);
  assert.equal(blocks[2].url, undefined);
  assert.equal(blocks[3].provider, "youtube");
  assert.equal(blocks[3].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("normalizePageBlocks lehnt ungültige Eingaben ab", () => {
  const invalid = [
    [{ type: "iframe" }],
    [{ type: "button", label: "x", url: "javascript:alert(1)" }],
    [{ type: "video", url: "https://example.com/video.mp4" }],
    [{ type: "image" }],
    "kein array",
  ];
  for (const input of invalid) {
    assert.throws(() => normalizePageBlocks(input), PageBlockValidationError);
  }
  assert.deepEqual(normalizePageBlocks(null), []);
});

