"use strict";

const { htmlToMarkdown } = require("./markdown");
const { normalizeForHash } = require("../../util");

/**
 * Divi-Toggles/Akkordeons (.et_pb_toggle) als Frage/Antwort-Paare.
 * Divi rendert manche Module für Desktop und Mobil doppelt – Duplikate werden verworfen.
 */
function extractToggles($, root) {
  const toggles = [];
  const seen = new Set();

  root.find(".et_pb_toggle").each((_, el) => {
    const toggle = $(el);
    const title = toggle.find(".et_pb_toggle_title").first().text().replace(/\s+/g, " ").trim();
    const body = htmlToMarkdown(toggle.find(".et_pb_toggle_content").first().html());
    if (!title || !body) return;

    const key = normalizeForHash(`${title} ${body}`);
    if (seen.has(key)) return;
    seen.add(key);

    toggles.push({ title, body });
  });

  root.find(".et_pb_toggle").remove();
  return toggles;
}

module.exports = { extractToggles };
