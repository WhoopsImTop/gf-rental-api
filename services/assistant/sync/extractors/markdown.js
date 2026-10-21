"use strict";

const TurndownService = require("turndown");

function cellText(cell) {
  return String(cell.textContent || "")
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/\|/g, "/")
    .trim();
}

function createTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });

  td.remove(["script", "style", "noscript", "iframe", "form", "button", "select", "input", "svg", "video", "audio"]);

  // Bilder werden nicht als Wissen übernommen.
  td.addRule("images", { filter: ["img", "picture", "figure"], replacement: () => "" });

  // Überschriften behalten ihren Anker ({#id}) für Deep-Links.
  td.addRule("headingsWithAnchor", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement(content, node) {
      const text = content
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\s+/g, " ")
        .replace(/#/g, "")
        .trim();
      if (!text) return "";
      const level = Number(node.nodeName.charAt(1));
      const anchor = node.getAttribute && node.getAttribute("data-anchor");
      return `\n\n${"#".repeat(level)} ${text}${anchor ? ` {#${anchor}}` : ""}\n\n`;
    },
  });

  // Nur echte Ziele verlinken; Sprunganker/JS-Links werden zu Text.
  td.addRule("safeLinks", {
    filter: "a",
    replacement(content, node) {
      const text = content.replace(/\s+/g, " ").trim();
      const href = (node.getAttribute("href") || "").trim();
      if (!text) return "";
      if (!/^(https?:|mailto:|tel:)/i.test(href)) return text;
      return `[${text}](${href})`;
    },
  });

  // Tabellen als Markdown-Tabellen (Turndown kann das ohne Plugin nicht).
  td.addRule("tables", {
    filter: "table",
    replacement(content, node) {
      const rows = Array.from(node.querySelectorAll("tr"))
        .map((tr) => Array.from(tr.querySelectorAll("th,td")).map(cellText))
        .filter((cells) => cells.some(Boolean));
      if (!rows.length) return "";
      const width = Math.max(...rows.map((cells) => cells.length));
      const line = (cells) => `| ${Array.from({ length: width }, (_, i) => cells[i] || "").join(" | ")} |`;
      const [head, ...body] = rows;
      return `\n\n${[line(head), line(Array(width).fill("---")), ...body.map(line)].join("\n")}\n\n`;
    },
  });

  return td;
}

const turndown = createTurndown();

/** Räumt Divi-typischen Leerraum auf (nbsp, Zero-Width-Space, leere Zeilen). */
function cleanMarkdown(markdown) {
  return String(markdown || "")
    .replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, "")
    // Icon-Font-Glyphen (Private Use Area), z. B. Divi-Icons
    .replace(/[\ue000-\uf8ff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/^[ \t]*\\?[ \t]*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToMarkdown(html) {
  if (!html) return "";
  return cleanMarkdown(turndown.turndown(html));
}

/** Markdown → reiner Text (für Längen/Duplikate/Volltextsuche). */
function markdownToText(markdown) {
  return String(markdown || "")
    .replace(/\{#[^}]+\}/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\|?\s*-{3,}.*$/gm, "")
    .replace(/[*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { htmlToMarkdown, markdownToText, cleanMarkdown };
