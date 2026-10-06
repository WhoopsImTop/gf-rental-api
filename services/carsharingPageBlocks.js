const crypto = require("crypto");
const sanitizeHtml = require("sanitize-html");

/**
 * Validierung der Inhaltsblöcke für Carsharing-Fahrzeugseiten (pageBlocks).
 * Diese Seiten rendert das externe WordPress-Plugin, deshalb wird hier alles
 * auf ein festes Schema reduziert: unbekannte Felder werden verworfen und HTML
 * wird über eine Allowlist gefiltert.
 */

const BLOCK_TYPES = ["text", "accordion", "links", "button", "image", "video"];
const BUTTON_STYLES = ["primary", "secondary"];
const MAX_BLOCKS = 50;
const MAX_ITEMS = 30;
const MAX_HTML_LENGTH = 20000;
const MAX_TEXT_LENGTH = 255;

const HTML_OPTIONS = {
  allowedTags: ["p", "h2", "h3", "strong", "b", "em", "i", "s", "u", "ul", "ol", "li", "a", "br", "blockquote"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const result = { tagName, attribs: { ...attribs } };
      if (attribs.target === "_blank") {
        result.attribs.rel = "noopener noreferrer";
      } else {
        delete result.attribs.target;
      }
      return result;
    },
  },
};

class PageBlockValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PageBlockValidationError";
  }
}

function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function cleanHtml(value) {
  if (typeof value !== "string") return "";
  if (value.length > MAX_HTML_LENGTH) {
    throw new PageBlockValidationError("Ein Textblock ist zu lang");
  }
  return sanitizeHtml(value, HTML_OPTIONS).trim();
}

/** Erlaubt http(s), mailto, tel und relative Pfade ("/…"). Sonst null. */
function sanitizeUrl(value) {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || url.length > 2048) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    // ungültige URL
  }
  return null;
}

/** Erkennt YouTube- und Vimeo-URLs und liefert { provider, videoId } oder null. */
function parseVideoUrl(value) {
  if (typeof value !== "string") return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;

  const host = parsed.hostname.replace(/^www\.|^m\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (["youtube.com", "youtube-nocookie.com"].includes(host)) {
    let id = null;
    if (segments[0] === "watch") id = parsed.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(segments[0])) id = segments[1];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return { provider: "youtube", videoId: id };
  }
  if (host === "youtu.be" && /^[A-Za-z0-9_-]{11}$/.test(segments[0] || "")) {
    return { provider: "youtube", videoId: segments[0] };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = segments.find((segment) => /^\d{6,12}$/.test(segment));
    if (id) return { provider: "vimeo", videoId: id };
  }
  return null;
}

function videoUrlFor(provider, videoId) {
  return provider === "youtube"
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://vimeo.com/${videoId}`;
}

function blockId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value)
    ? value
    : crypto.randomUUID();
}

function requireUrl(value, label) {
  const url = sanitizeUrl(value);
  if (!url) {
    throw new PageBlockValidationError(`Ungültige URL bei "${label || "Link"}"`);
  }
  return url;
}

function itemsOf(block) {
  if (!Array.isArray(block.items)) return [];
  if (block.items.length > MAX_ITEMS) {
    throw new PageBlockValidationError(`Maximal ${MAX_ITEMS} Einträge pro Block erlaubt`);
  }
  return block.items.filter((item) => item && typeof item === "object");
}

const normalizers = {
  text: (block) => ({ body_html: cleanHtml(block.body_html) }),

  accordion: (block) => ({
    items: itemsOf(block).map((item) => ({
      title: cleanText(item.title),
      body_html: cleanHtml(item.body_html),
    })),
  }),

  links: (block) => ({
    items: itemsOf(block).map((item) => {
      const label = cleanText(item.label);
      return { label, url: requireUrl(item.url, label), newTab: item.newTab === true };
    }),
  }),

  button: (block) => {
    const label = cleanText(block.label);
    return {
      label,
      url: requireUrl(block.url, label || "Button"),
      style: BUTTON_STYLES.includes(block.style) ? block.style : "primary",
      newTab: block.newTab === true,
    };
  },

  image: (block) => {
    const mediaId = Number.parseInt(block.mediaId, 10);
    if (!Number.isInteger(mediaId) || mediaId <= 0) {
      throw new PageBlockValidationError("Bildblock ohne Bild");
    }
    return { mediaId, alt: cleanText(block.alt), caption: cleanText(block.caption) };
  },

  video: (block) => {
    let video = parseVideoUrl(block.url);
    if (!video && ["youtube", "vimeo"].includes(block.provider)) {
      video = parseVideoUrl(videoUrlFor(block.provider, String(block.videoId || "")));
    }
    if (!video) {
      throw new PageBlockValidationError("Ungültige Video-URL (nur YouTube oder Vimeo)");
    }
    return { ...video, url: videoUrlFor(video.provider, video.videoId), title: cleanText(block.title) };
  },
};

/**
 * Prüft und bereinigt eine Blockliste. Wirft PageBlockValidationError bei
 * ungültigen Eingaben. null/undefined ergibt eine leere Liste.
 */
function normalizePageBlocks(blocks) {
  if (blocks == null) return [];
  if (!Array.isArray(blocks)) {
    throw new PageBlockValidationError("pageBlocks muss eine Liste sein");
  }
  if (blocks.length > MAX_BLOCKS) {
    throw new PageBlockValidationError(`Maximal ${MAX_BLOCKS} Blöcke erlaubt`);
  }
  return blocks.map((block) => {
    if (!block || typeof block !== "object" || !BLOCK_TYPES.includes(block.type)) {
      throw new PageBlockValidationError("Unbekannter Blocktyp");
    }
    return { id: blockId(block.id), type: block.type, ...normalizers[block.type](block) };
  });
}

module.exports = {
  BLOCK_TYPES,
  PageBlockValidationError,
  normalizePageBlocks,
  parseVideoUrl,
  sanitizeUrl,
};
