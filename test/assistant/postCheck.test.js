const test = require("node:test");
const assert = require("node:assert/strict");

const { postCheck, numericValues } = require("../../services/assistant/chat/postCheck");

const sources = [
  { n: 1, text: "Die einmalige Anmeldegebühr beträgt 30,- €. Bürozeiten Mo. – Fr. von 8:00 bis 17:00 Uhr. Telefon 07681 474 008-0" },
  { n: 2, text: "Klasse XS: 7-24 Uhr 1,80 €; Tag (24 H) 29 €; Woche (7 T) 155 €" },
];

test("numericValues versteht deutsche und englische Schreibweisen", () => {
  assert.deepEqual(numericValues("1,80"), [1.8]);
  assert.deepEqual(numericValues("1.500").sort(), [1.5, 1500].sort());
});

test("belegte Zahlen und gültige Quellen bestehen die Prüfung", () => {
  const result = postCheck("Die Anmeldegebühr kostet 30 € [1]. Ein XS kostet 1,80 € pro Stunde und 29 € am Tag [2].", sources);
  assert.equal(result.ok, true);
  assert.deepEqual(result.cited, [1, 2]);
  assert.deepEqual(result.unverifiedNumbers, []);
});

test("nicht belegte Zahlen werden erkannt", () => {
  const result = postCheck("Ein XS kostet 1,60 € pro Stunde [2].", sources);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unverifiedNumbers, ["1,60"]);
});

test("Zahlen aus der Frage gelten als belegt, kleine Mengenangaben werden ignoriert", () => {
  const result = postCheck("Für 3 Tage und 250 km nutzen Sie den Preisrechner [2].", sources, ["Was kosten 3 Tage mit 250 km?"]);
  assert.equal(result.ok, true);
});

test("erfundene Quellen und Links werden entfernt", () => {
  const result = postCheck("Siehe [Preisliste](https://evil.example/preise) und https://example.com [7]. Telefon 07681 474 008-0 [1].", sources);
  assert.equal(result.text.includes("evil.example"), false);
  assert.equal(result.text.includes("example.com"), false);
  assert.equal(result.text.includes("[7]"), false);
  assert.deepEqual(result.invalidCitations, [7]);
  assert.equal(result.removedLinks.length, 2);
  assert.equal(result.ok, true);
});

test("Listennummerierung zählt nicht als Fakt", () => {
  const result = postCheck("1. Registrieren [1]\n2. Buchen [1]\n12. Fahren [1]", sources);
  assert.equal(result.ok, true);
});
