"use strict";

/**
 * Konfiguration des Carsharing-Assistenten (Website einlernen + Test-Chat).
 * Fachliche Grundlage: docs/umsetzungskonzept-carsharing-assistent.md
 */

function envInt(name, fallback) {
  const parsed = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envList(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const SITE_BASE = (process.env.ASSISTANT_SITE_BASE || "https://gruene-flotte.com/carsharing").replace(/\/$/, "");
const SITE_ORIGIN = new URL(SITE_BASE).origin;

const CHAT_MODELS = envList("ASSISTANT_CHAT_MODELS", ["gpt-4o-mini", "gpt-5-mini", "gpt-5.4-mini"]);

module.exports = {
  SITE_BASE,
  SITE_ORIGIN,
  USER_AGENT: "GrueneFlotte-Assistant-Crawler/1.0 (+https://gruene-flotte.com)",
  /** Mindestabstand zwischen zwei Requests an die Website. */
  REQUEST_INTERVAL_MS: envInt("ASSISTANT_REQUEST_INTERVAL_MS", 700),
  REQUEST_TIMEOUT_MS: 30_000,

  SUPABASE_URL: process.env.ASSISTANT_SUPABASE_URL || process.env.SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.ASSISTANT_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  EMBEDDING_MODEL: process.env.ASSISTANT_EMBEDDING_MODEL || "text-embedding-3-small",
  EMBEDDING_DIMS: 1536,
  EMBEDDING_BATCH_SIZE: 96,

  CHAT_MODELS,
  DEFAULT_CHAT_MODEL: process.env.ASSISTANT_CHAT_MODEL || CHAT_MODELS[0],
  TOP_K: envInt("ASSISTANT_TOP_K", 6),
  /** Unterhalb dieser Vektor-Ähnlichkeit (und ohne Volltexttreffer) gilt ein Chunk als nicht relevant. */
  MIN_VECTOR_SIMILARITY: Number(process.env.ASSISTANT_MIN_SIMILARITY) || 0.3,
  MAX_HISTORY_MESSAGES: 6,
  MAX_TOOL_ROUNDS: 3,
  /** true: Antworten mit unbelegten Zahlen werden durch eine Fallback-Antwort ersetzt. */
  STRICT_POST_CHECK: String(process.env.ASSISTANT_STRICT_POST_CHECK ?? "true") !== "false",

  /** Nächtliches inkrementelles Einlernen (ab Phase 2 aktivieren). */
  SYNC_SCHEDULER_ENABLED: String(process.env.ASSISTANT_SYNC_ENABLED ?? "false") === "true",
  SYNC_HOUR: envInt("ASSISTANT_SYNC_HOUR", 3),
  /** Löschfrist für Test-Chat-Verläufe. */
  CHAT_RETENTION_DAYS: envInt("ASSISTANT_CHAT_RETENTION_DAYS", 90),
  /** Anzahl Index-Versionen, die neben der aktiven behalten werden. */
  KEEP_INDEX_VERSIONS: 3,
  /** News älter als X Tage werden nicht eingelernt (veraltete Aussagen). */
  NEWS_MAX_AGE_DAYS: envInt("ASSISTANT_NEWS_MAX_AGE_DAYS", 365),

  /** URL der Fahrzeugseite; {id} wird ersetzt. Ohne {id}: Link auf die Flottenübersicht. */
  VEHICLE_URL_TEMPLATE: process.env.ASSISTANT_VEHICLE_URL_TEMPLATE || `${SITE_BASE}/flotte/`,

  /** Seiten, die nie eingelernt werden (Slug = letzter Pfadteil). */
  EXCLUDED_SLUGS: new Set([
    "kasse",
    "warenkorb",
    "gutschein-shop",
    "newsletter-anmeldung",
    "newsletter-anmeldung-erfolgreich",
    "erfolgreich-versendet",
    "buchungssystem",
    "registrierung-auswahl-landingpage",
    "carsharing-news-bonn",
    "carsharing-news-freiburg",
  ]),
  EXCLUDED_SLUG_PATTERNS: [/-no-header$/],

  /** Seiten mit weniger Text als das und einem Iframe sind reine Formular-/Widget-Hüllen. */
  IFRAME_ONLY_MAX_TEXT: 600,
  /** Ein Block, der auf so vielen Seiten identisch vorkommt, wird nur einmal eingelernt. */
  BOILERPLATE_MIN_PAGES: 4,

  /** Erklärvideos (noch ohne Transkript): Dateiname → Titel + passende Anleitungsseite. */
  VIDEO_CATALOG: {
    "kim-buchen.mp4": { title: "Erklärvideo: Buchen", page: "so-geht-carsharing/buchen" },
    "jaqui-fahren.mp4": { title: "Erklärvideo: Einsteigen & Fahren", page: "so-geht-carsharing/fahren" },
    "christian-schaden.mp4": { title: "Erklärvideo: Schadensmeldung", page: "so-geht-carsharing/fahren" },
    "zoe-elektro.mp4": { title: "Erklärvideo: E-Carsharing", page: "so-geht-carsharing/vor-fahrtbeginn" },
    "jaqui-tanken.mp4": { title: "Erklärvideo: Tanken", page: "so-geht-carsharing/fahrt-beenden" },
    "jonas-karten.mp4": { title: "Erklärvideo: Kartenmodelle", page: "mietpreise-gruene-flotte" },
    "jonas-sicherheitspakete.mp4": { title: "Erklärvideo: Sicherheitspakete", page: "mietpreise-gruene-flotte" },
    "GF-Problem-melden.mp4": { title: "Erklärvideo: Problem melden", page: "so-geht-carsharing/problem-melden" },
  },

  /** Autorität: 1 = verbindlich (Preise/Preisliste), 2 = FAQ/Anleitungen/Fahrzeuge, 3 = Seiten, 4 = News. */
  AUTHORITY_BY_SLUG: {
    "preisliste-konditionen-verstoesse": 1,
    faqs: 2,
    "so-geht-carsharing": 2,
    "rabatte-verguenstigungen": 2,
  },

  REGIONS: ["Freiburg", "Bonn", "Siegburg", "Emmendingen", "Kirchzarten", "Waldkirch", "Gundelfingen"],

  FALLBACK_CONTACT_URL: `${SITE_BASE}/faqs/#Kundenservice`,
};
