"use strict";

/**
 * Serverseitige Prüfung jeder Antwort:
 *  - Quellenverweise [n] müssen auf gelieferte Quellen zeigen (sonst entfernt)
 *  - Links/URLs vom Modell werden entfernt (Links kommen nur aus Quellen-Metadaten)
 *  - jede Zahl (Preise, Daten, Telefonnummern, …) muss in Quellen, Werkzeug-Ergebnissen oder der Frage vorkommen
 */

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const CITATION_RE = /\[(\d{1,2})\]/g;

/**
 * Mögliche Zahlenwerte eines Tokens: "1,80" → 1.8; "1.500" → 1500 (oder 1.5); "29" → 29.
 * Daten/Telefonnummern ("01.10.2026") liefern keinen Wert und werden über ihre Ziffernfolge verglichen.
 */
function numericValues(token) {
  const values = [];
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) {
    values.push(Number(token.replace(/\./g, "").replace(",", ".")));
    if (!token.includes(",")) values.push(Number(token));
  } else if (/^\d+,\d+$/.test(token)) {
    values.push(Number(token.replace(",", ".")));
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) {
    values.push(Number(token.replace(/,/g, "")));
  } else if (/^\d+(\.\d+)?$/.test(token)) {
    values.push(Number(token));
  }
  return [...new Set(values.filter(Number.isFinite).map((value) => Math.round(value * 10000) / 10000))];
}

function evidenceNumbers(texts) {
  const set = new Set();
  for (const text of texts) {
    for (const token of String(text || "").match(NUMBER_RE) || []) {
      for (const value of numericValues(token)) set.add(value);
      // Ziffernfolgen ohne Trenner (Telefonnummern "07681 474 008-0" → einzelne Blöcke reichen)
      set.add(token.replace(/\D/g, ""));
    }
  }
  return set;
}

function stripLinks(text, removed) {
  let out = text.replace(/\[([^\]]+)\]\((?:https?:|mailto:|tel:)[^)]*\)/gi, (match, label) => {
    removed.push(match);
    return label;
  });
  out = out.replace(/https?:\/\/[^\s)>\]]+/gi, (match) => {
    removed.push(match);
    return "";
  });
  return out;
}

function stripInvalidCitations(text, validNumbers, invalid) {
  return text.replace(CITATION_RE, (match, num) => {
    if (validNumbers.has(Number(num))) return match;
    invalid.push(Number(num));
    return "";
  });
}

function citedNumbers(text) {
  return [...new Set([...String(text).matchAll(CITATION_RE)].map((match) => Number(match[1])))];
}

/**
 * @param {string} answer Markdown-Antwort des Modells
 * @param {{n: number, text: string}[]} sources alle dem Modell gelieferten Quellen (Chunks + Werkzeuge)
 * @param {string[]} extraEvidence Frage(n) des Nutzers, Werkzeug-Argumente
 */
function postCheck(answer, sources, extraEvidence = []) {
  const removedLinks = [];
  const invalidCitations = [];
  const validNumbers = new Set(sources.map((source) => source.n));

  let text = stripLinks(String(answer || ""), removedLinks);
  text = stripInvalidCitations(text, validNumbers, invalidCitations);
  text = text.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();

  const evidence = evidenceNumbers([...sources.map((source) => source.text), ...extraEvidence]);
  const unverifiedNumbers = [];
  const withoutCitations = text.replace(CITATION_RE, " ");
  for (const line of withoutCitations.split("\n")) {
    // Listennummerierung "1." am Zeilenanfang ist kein Fakt
    const content = line.replace(/^\s*\d+\.\s+/, "");
    for (const token of content.match(NUMBER_RE) || []) {
      const values = numericValues(token);
      const isSmallCount = values.length === 1 && Number.isInteger(values[0]) && values[0] <= 10 && !/[.,]/.test(token);
      if (isSmallCount) continue;
      const digits = token.replace(/\D/g, "");
      if (values.some((value) => evidence.has(value)) || evidence.has(digits)) continue;
      unverifiedNumbers.push(token);
    }
  }

  return {
    text,
    cited: citedNumbers(text),
    removedLinks,
    invalidCitations: [...new Set(invalidCitations)],
    unverifiedNumbers: [...new Set(unverifiedNumbers)],
    ok: unverifiedNumbers.length === 0,
  };
}

module.exports = { postCheck, numericValues, citedNumbers };
