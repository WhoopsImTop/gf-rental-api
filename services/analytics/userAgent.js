"use strict";

/**
 * Grobe User-Agent-Auswertung (Gerätetyp, Browser, Betriebssystem).
 * Es werden nur diese Kategorien gespeichert, nie der User-Agent selbst.
 */

const BOT_PATTERN =
  /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp\/|curl\/|wget\/|python-requests|python-urllib|axios\/|node-fetch|go-http-client|java\/|okhttp|httpclient|semrush|ahrefs|mj12|dataforseo|phantomjs|selenium|puppeteer|playwright|scrapy/i;

const isBot = (userAgent) => !userAgent || BOT_PATTERN.test(userAgent);

function detectDevice(ua) {
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "Tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "Mobil";
  return "Desktop";
}

function detectBrowser(ua) {
  if (/Instagram/i.test(ua)) return "Instagram (In-App)";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook (In-App)";
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return "TikTok (In-App)";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn (In-App)";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Firefox|FxiOS/.test(ua)) return "Firefox";
  if (/CriOS|Chrome|Chromium/.test(ua)) return "Chrome";
  if (/Safari/.test(ua)) return "Safari";
  return "Sonstige";
}

function detectOs(ua) {
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Sonstige";
}

function parseUserAgent(userAgent) {
  const ua = String(userAgent || "");
  return {
    device: detectDevice(ua),
    browser: detectBrowser(ua),
    os: detectOs(ua),
  };
}

module.exports = { isBot, parseUserAgent };
