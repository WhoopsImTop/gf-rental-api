"use strict";

const { htmlToMarkdown } = require("./markdown");
const { normalizeForHash } = require("../../util");

/**
 * FAQ-Seite (Custom-Code-Modul):
 *   .custom-faq-category > h3.custom-faq-category-title#<Kategorie>
 *   .custom-faq-item#<Keyword-Liste> > h5.custom-faq-item-title + .custom-faq-item-content
 * Entfernt die FAQ danach aus dem DOM, damit sie nicht doppelt als Fließtext landet.
 */
function extractFaqs($, root) {
  const faqs = [];
  const seen = new Set();

  root.find(".custom-faq-category").each((_, categoryEl) => {
    const category = $(categoryEl);
    const titleEl = category.find(".custom-faq-category-title").first();
    const categoryName = titleEl.text().replace(/\s+/g, " ").trim();
    const anchor = titleEl.attr("id") || null;

    category.find(".custom-faq-item").each((__, itemEl) => {
      const item = $(itemEl);
      const question = item
        .find(".custom-faq-item-title")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .replace(/^\d+\.\s*/, "")
        .trim();
      const answer = htmlToMarkdown(item.find(".custom-faq-item-content").first().html());
      if (!question || !answer) return;

      const key = normalizeForHash(`${question} ${answer}`);
      if (seen.has(key)) return;
      seen.add(key);

      const keywords = String(item.attr("id") || "")
        .split(",")
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword && keyword.length <= 80);

      faqs.push({ category: categoryName, anchor, question, answer, keywords: [...new Set(keywords)] });
    });
  });

  root.find(".custom-faq-wrapper").remove();
  return faqs;
}

module.exports = { extractFaqs };
