"use strict";

/**
 * Ordnet einen Seitenaufruf einer Traffic-Quelle (z. B. "ChatGPT", "Instagram",
 * "Google Ads") und einem Kanal zu. Arbeitet ausschließlich mit dem
 * Referrer-Hostnamen, UTM-Parametern und dem *Typ* einer Klick-ID – die
 * Klick-ID selbst wird nie übertragen oder gespeichert.
 */

const CHANNELS = Object.freeze({
  AI: "KI-Assistent",
  SOCIAL: "Social",
  PAID: "Bezahlt",
  SEARCH: "Suche",
  EMAIL: "E-Mail",
  REFERRAL: "Verweis",
  CAMPAIGN: "Kampagne",
  DIRECT: "Direkt",
});

const DIRECT = Object.freeze({ source: "Direkt", channel: CHANNELS.DIRECT });

const DEFAULT_OWN_DOMAINS = ["gruene-flotte.com", "gruene-flotte.de"];

// Reihenfolge ist relevant: spezifische Subdomains (gemini.google.com,
// mail.google.com) müssen vor dem generischen Google-Matcher stehen.
const HOST_RULES = [
  // KI-Assistenten
  [["chatgpt.com", "chat.openai.com", "openai.com"], "ChatGPT", CHANNELS.AI],
  [["perplexity.ai"], "Perplexity", CHANNELS.AI],
  [["claude.ai"], "Claude", CHANNELS.AI],
  [["gemini.google.com", "bard.google.com"], "Gemini", CHANNELS.AI],
  [["copilot.microsoft.com", "copilot.cloud.microsoft"], "Copilot", CHANNELS.AI],
  [["chat.mistral.ai"], "Mistral", CHANNELS.AI],
  [["chat.deepseek.com"], "DeepSeek", CHANNELS.AI],
  [["grok.com"], "Grok", CHANNELS.AI],
  [["meta.ai"], "Meta AI", CHANNELS.AI],
  [["you.com"], "You.com", CHANNELS.AI],

  // E-Mail (vor Suche, wegen mail.google.com)
  [["mail.google.com", "com.google.android.gm"], "Gmail", CHANNELS.EMAIL],
  [
    ["outlook.live.com", "outlook.office.com", "outlook.office365.com"],
    "Outlook",
    CHANNELS.EMAIL,
  ],
  [["mail.yahoo.com"], "Yahoo Mail", CHANNELS.EMAIL],
  [["suche.web.de"], "WEB.DE", CHANNELS.SEARCH],
  [["web.de"], "WEB.DE Mail", CHANNELS.EMAIL],
  [["suche.gmx.net", "suche.gmx.de"], "GMX", CHANNELS.SEARCH],
  [["gmx.net", "gmx.de"], "GMX Mail", CHANNELS.EMAIL],

  // Social
  [["instagram.com"], "Instagram", CHANNELS.SOCIAL],
  [
    ["facebook.com", "fb.com", "fb.me", "com.facebook.katana"],
    "Facebook",
    CHANNELS.SOCIAL,
  ],
  [["tiktok.com"], "TikTok", CHANNELS.SOCIAL],
  [["youtube.com", "youtu.be", "com.google.android.youtube"], "YouTube", CHANNELS.SOCIAL],
  [["linkedin.com", "lnkd.in", "com.linkedin.android"], "LinkedIn", CHANNELS.SOCIAL],
  [["x.com", "twitter.com", "t.co"], "X", CHANNELS.SOCIAL],
  [["threads.net", "threads.com"], "Threads", CHANNELS.SOCIAL],
  [["reddit.com"], "Reddit", CHANNELS.SOCIAL],
  [["snapchat.com"], "Snapchat", CHANNELS.SOCIAL],
  [["xing.com"], "XING", CHANNELS.SOCIAL],
  [["bsky.app"], "Bluesky", CHANNELS.SOCIAL],
  [["whatsapp.com", "wa.me"], "WhatsApp", CHANNELS.SOCIAL],
  [["t.me", "telegram.org", "org.telegram.messenger"], "Telegram", CHANNELS.SOCIAL],

  // Suche
  [["bing.com"], "Bing", CHANNELS.SEARCH],
  [["duckduckgo.com"], "DuckDuckGo", CHANNELS.SEARCH],
  [["ecosia.org"], "Ecosia", CHANNELS.SEARCH],
  [["search.brave.com"], "Brave Search", CHANNELS.SEARCH],
  [["startpage.com"], "Startpage", CHANNELS.SEARCH],
  [["qwant.com"], "Qwant", CHANNELS.SEARCH],
  [["search.yahoo.com", "yahoo.com"], "Yahoo", CHANNELS.SEARCH],
  [["yandex.ru", "yandex.com"], "Yandex", CHANNELS.SEARCH],
  [["baidu.com"], "Baidu", CHANNELS.SEARCH],
  [["suche.t-online.de"], "t-online", CHANNELS.SEARCH],
  [["com.google.android.googlequicksearchbox"], "Google", CHANNELS.SEARCH],
];

const GOOGLE_HOST = /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/;
const PINTEREST_HOST = /(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/;

// utm_source-Kürzel, die keine Hostnamen sind.
const UTM_SOURCE_ALIASES = {
  chatgpt: "chatgpt.com",
  openai: "chatgpt.com",
  perplexity: "perplexity.ai",
  claude: "claude.ai",
  gemini: "gemini.google.com",
  copilot: "copilot.microsoft.com",
  ig: "instagram.com",
  insta: "instagram.com",
  instagram: "instagram.com",
  fb: "facebook.com",
  facebook: "facebook.com",
  tiktok: "tiktok.com",
  tt: "tiktok.com",
  youtube: "youtube.com",
  yt: "youtube.com",
  linkedin: "linkedin.com",
  li: "linkedin.com",
  twitter: "x.com",
  x: "x.com",
  pinterest: "pinterest.com",
  reddit: "reddit.com",
  whatsapp: "whatsapp.com",
  telegram: "telegram.org",
  xing: "xing.com",
  google: "google.com",
  bing: "bing.com",
  ecosia: "ecosia.org",
  duckduckgo: "duckduckgo.com",
};

const PAID_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paidsearch",
  "paid_search",
  "paid-search",
  "paidsocial",
  "paid_social",
  "paid-social",
  "social_paid",
  "social-paid",
  "ads",
  "ad",
  "cpm",
  "display",
  "banner",
  "retargeting",
]);

const EMAIL_MEDIUMS = new Set(["email", "e-mail", "mail", "newsletter"]);

// Typ der Klick-ID → Werbeplattform. "meta" (fbclid) wird auch an organische
// Facebook/Instagram-Links gehängt und gilt deshalb nicht automatisch als Anzeige.
const CLICK_SOURCES = {
  google_ads: { source: "Google Ads", paid: true },
  microsoft_ads: { source: "Microsoft Ads", paid: true },
  tiktok_ads: { source: "TikTok Ads", paid: true },
  linkedin_ads: { source: "LinkedIn Ads", paid: true },
  x_ads: { source: "X Ads", paid: true },
  pinterest_ads: { source: "Pinterest Ads", paid: true },
  meta: { source: "Facebook", paid: false },
};

const PAID_SOURCE_BY_PLATFORM = {
  Google: "Google Ads",
  YouTube: "Google Ads",
  Gemini: "Google Ads",
  Bing: "Microsoft Ads",
  Instagram: "Instagram Ads",
  Facebook: "Meta Ads",
  TikTok: "TikTok Ads",
  LinkedIn: "LinkedIn Ads",
  X: "X Ads",
  Pinterest: "Pinterest Ads",
  Reddit: "Reddit Ads",
  Snapchat: "Snapchat Ads",
};

const IN_APP_BROWSERS = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB/i, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Snapchat/i, "Snapchat"],
  [/Pinterest/i, "Pinterest"],
];

const hostMatches = (host, domain) =>
  host === domain || host.endsWith(`.${domain}`);

const stripWww = (host) => host.replace(/^www\d?\./, "");

/** Reduziert einen Referrer (URL oder Hostname) auf den Hostnamen. */
function sanitizeReferrerHost(value) {
  if (value == null || typeof value !== "string") return null;
  const raw = value.trim().slice(0, 2048);
  if (!raw) return null;

  let host = raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      host = new URL(raw).hostname;
    } catch {
      return null;
    }
  } else {
    host = raw.split(/[/?#]/)[0];
  }

  host = host.toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || !host.includes(".")) return null;
  return host;
}

function lookupHost(host) {
  if (!host) return null;
  for (const [domains, source, channel] of HOST_RULES) {
    if (domains.some((d) => hostMatches(host, d))) return { source, channel };
  }
  if (GOOGLE_HOST.test(host)) return { source: "Google", channel: CHANNELS.SEARCH };
  if (PINTEREST_HOST.test(host)) {
    return { source: "Pinterest", channel: CHANNELS.SOCIAL };
  }
  return null;
}

function lookupUtmSource(utmSource) {
  if (!utmSource) return null;
  const normalized = utmSource.toLowerCase().trim();
  const alias = UTM_SOURCE_ALIASES[normalized];
  return lookupHost(alias || sanitizeReferrerHost(normalized));
}

function isOwnHost(host, ownDomains) {
  if (!host) return false;
  // IP-Adressen (lokale Netze, Dev-Server) sind nie eine echte Traffic-Quelle.
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return ownDomains.some((d) => hostMatches(host, d));
}

function inAppBrowserSource(userAgent) {
  if (!userAgent) return null;
  for (const [pattern, source] of IN_APP_BROWSERS) {
    if (pattern.test(userAgent)) return source;
  }
  return null;
}

const prettify = (value) => {
  const cleaned = String(value).trim().replace(/[_+]+/g, " ").slice(0, 60);
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : null;
};

/**
 * @param {object} input
 * @param {string|null} [input.referrerHost]
 * @param {string|null} [input.utmSource]
 * @param {string|null} [input.utmMedium]
 * @param {string|null} [input.clickSource] Typ der Klick-ID, z. B. "google_ads"
 * @param {string|null} [input.userAgent]
 * @param {string[]} [input.ownDomains]
 * @returns {{ source: string, channel: string }}
 */
function classifyTraffic({
  referrerHost = null,
  utmSource = null,
  utmMedium = null,
  clickSource = null,
  userAgent = null,
  ownDomains = DEFAULT_OWN_DOMAINS,
} = {}) {
  const host =
    referrerHost && !isOwnHost(referrerHost, ownDomains) ? referrerHost : null;
  const medium = (utmMedium || "").toLowerCase().trim();
  const click = CLICK_SOURCES[clickSource] || null;

  const fromUtm = lookupUtmSource(utmSource);
  const fromHost = lookupHost(host);
  const fromInApp = inAppBrowserSource(userAgent);
  const platform =
    fromUtm?.source || fromHost?.source || fromInApp || (click && !click.paid ? click.source : null);

  // 1. Eindeutige Anzeigen-Klick-IDs (gclid, msclkid, ttclid, …)
  if (click?.paid) return { source: click.source, channel: CHANNELS.PAID };

  // 2. Bezahlt laut utm_medium
  if (PAID_MEDIUMS.has(medium)) {
    const paidSource =
      PAID_SOURCE_BY_PLATFORM[platform] ||
      (utmSource ? `${prettify(utmSource)} Ads` : "Sonstige Anzeigen");
    return { source: paidSource, channel: CHANNELS.PAID };
  }

  // 3. Explizit getaggte Links (utm_source)
  if (utmSource) {
    const channel = EMAIL_MEDIUMS.has(medium)
      ? CHANNELS.EMAIL
      : fromUtm?.channel || (medium === "social" ? CHANNELS.SOCIAL : CHANNELS.CAMPAIGN);
    return { source: fromUtm?.source || prettify(utmSource), channel };
  }

  // 4. Bekannter Referrer
  if (fromHost) return fromHost;

  // 5. In-App-Browser (Instagram & TikTok senden oft keinen Referrer)
  if (fromInApp) return { source: fromInApp, channel: CHANNELS.SOCIAL };

  // 6. fbclid ohne Referrer
  if (click) return { source: click.source, channel: CHANNELS.SOCIAL };

  // 7. Unbekannte externe Seite
  if (host) return { source: stripWww(host), channel: CHANNELS.REFERRAL };

  return { ...DIRECT };
}

module.exports = {
  CHANNELS,
  DIRECT,
  DEFAULT_OWN_DOMAINS,
  CLICK_SOURCES,
  classifyTraffic,
  sanitizeReferrerHost,
  inAppBrowserSource,
  isOwnHost,
};
