const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyTraffic,
  sanitizeReferrerHost,
} = require("../../services/analytics/trafficSource");
const { parseUserAgent, isBot } = require("../../services/analytics/userAgent");
const { sanitizePath } = require("../../services/analytics/pagePath");
const { resolveRange, bucketKeys, toSqlUtc } = require("../../services/analytics/timeRange");

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM_IN_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; de_DE)";
const TIKTOK_IN_APP =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6";

test("AI assistants are recognised by referrer and utm_source", () => {
  assert.deepEqual(classifyTraffic({ referrerHost: "chatgpt.com" }), {
    source: "ChatGPT",
    channel: "KI-Assistent",
  });
  // ChatGPT hängt utm_source=chatgpt.com an Links an, oft ohne Referrer.
  assert.equal(classifyTraffic({ utmSource: "chatgpt.com" }).source, "ChatGPT");
  assert.equal(classifyTraffic({ referrerHost: "www.perplexity.ai" }).source, "Perplexity");
  assert.equal(classifyTraffic({ referrerHost: "gemini.google.com" }).source, "Gemini");
});

test("click ids mark paid traffic without storing the id", () => {
  assert.deepEqual(classifyTraffic({ clickSource: "google_ads", referrerHost: "www.google.de" }), {
    source: "Google Ads",
    channel: "Bezahlt",
  });
  assert.equal(classifyTraffic({ clickSource: "tiktok_ads" }).source, "TikTok Ads");
});

test("utm_medium=paid maps the platform to its ads product", () => {
  assert.equal(
    classifyTraffic({ utmSource: "instagram", utmMedium: "paid_social" }).source,
    "Instagram Ads",
  );
  assert.equal(classifyTraffic({ utmSource: "google", utmMedium: "cpc" }).source, "Google Ads");
  assert.equal(classifyTraffic({ utmSource: "partnerx", utmMedium: "cpc" }).source, "Partnerx Ads");
});

test("social, search and email referrers", () => {
  assert.equal(classifyTraffic({ referrerHost: "l.instagram.com" }).source, "Instagram");
  assert.equal(classifyTraffic({ referrerHost: "www.tiktok.com" }).source, "TikTok");
  assert.deepEqual(classifyTraffic({ referrerHost: "www.google.de" }), {
    source: "Google",
    channel: "Suche",
  });
  assert.equal(classifyTraffic({ referrerHost: "www.ecosia.org" }).source, "Ecosia");
  assert.equal(classifyTraffic({ referrerHost: "com.google.android.gm" }).channel, "E-Mail");
  assert.equal(
    classifyTraffic({ utmSource: "herbst-newsletter", utmMedium: "email" }).channel,
    "E-Mail",
  );
});

test("in-app browsers without referrer are attributed to the app", () => {
  assert.equal(classifyTraffic({ userAgent: INSTAGRAM_IN_APP }).source, "Instagram");
  assert.equal(classifyTraffic({ userAgent: TIKTOK_IN_APP }).source, "TikTok");
  assert.equal(classifyTraffic({ userAgent: IPHONE_SAFARI }).source, "Direkt");
});

test("own domains count as direct, unknown hosts as referral", () => {
  assert.equal(classifyTraffic({ referrerHost: "mieten.gruene-flotte.com" }).source, "Direkt");
  assert.equal(classifyTraffic({ referrerHost: "192.168.2.130" }).source, "Direkt");
  assert.deepEqual(classifyTraffic({ referrerHost: "www.elektroauto-blog.de" }), {
    source: "elektroauto-blog.de",
    channel: "Verweis",
  });
});

test("sanitizeReferrerHost keeps only the hostname", () => {
  assert.equal(
    sanitizeReferrerHost("https://www.google.de/search?q=max.mustermann%40mail.de"),
    "www.google.de",
  );
  assert.equal(sanitizeReferrerHost("android-app://com.google.android.gm/"), "com.google.android.gm");
  assert.equal(sanitizeReferrerHost("not a url"), null);
});

test("sanitizePath strips queries and tokens", () => {
  const token = "a".repeat(64);
  assert.equal(sanitizePath(`/checkout?t=${token}&email=x@y.de`), "/checkout");
  assert.equal(sanitizePath(`/warenkorb/${token}/`), "/warenkorb/:token");
  assert.equal(sanitizePath("https://gruene-flotte.com/auto-abo#faq"), "/auto-abo");
});

test("user agent parsing and bot detection", () => {
  assert.deepEqual(parseUserAgent(IPHONE_SAFARI), { device: "Mobil", browser: "Safari", os: "iOS" });
  assert.equal(parseUserAgent(INSTAGRAM_IN_APP).browser, "Instagram (In-App)");
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(isBot("facebookexternalhit/1.1"), true);
  assert.equal(isBot(""), true);
  assert.equal(isBot(IPHONE_SAFARI), false);
});

test("time ranges produce Berlin-local buckets", () => {
  const now = new Date("2026-10-21T10:30:00Z"); // 12:30 in Berlin
  const today = resolveRange("today", now);
  assert.equal(today.from.toISOString(), "2026-10-20T22:00:00.000Z");
  assert.equal(bucketKeys(today).length, 13);

  const month = resolveRange("30d", now);
  const keys = bucketKeys(month);
  assert.equal(keys.length, 30);
  assert.equal(keys[keys.length - 1], "2026-10-21");
  assert.equal(month.previousTo.getTime(), month.from.getTime());

  assert.equal(resolveRange("bogus", now).key, "30d");
  assert.equal(toSqlUtc(today.from), "2026-10-20 22:00:00");
  assert.equal(bucketKeys(resolveRange("12m", now)).length, 13);
});
