"use strict";

const axios = require("axios");
const config = require("../config");
const { sleep } = require("../util");

let lastRequestAt = 0;

/** Höflicher Crawler: fester Mindestabstand, eigener User-Agent, 2 Retries bei 5xx/Netzwerkfehlern. */
async function fetchUrl(url, { responseType = "text", retries = 2 } = {}) {
  const parsed = new URL(url);
  if (parsed.origin !== config.SITE_ORIGIN) {
    throw new Error(`Crawler darf nur ${config.SITE_ORIGIN} abrufen: ${url}`);
  }

  for (let attempt = 0; ; attempt += 1) {
    const wait = lastRequestAt + config.REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    try {
      const res = await axios.get(url, {
        responseType,
        timeout: config.REQUEST_TIMEOUT_MS,
        maxContentLength: 20 * 1024 * 1024,
        headers: { "User-Agent": config.USER_AGENT, Accept: "*/*" },
        validateStatus: () => true,
      });
      if (res.status >= 500 && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.status >= 400) {
        const err = new Error(`HTTP ${res.status} für ${url}`);
        err.status = res.status;
        throw err;
      }
      return { status: res.status, data: res.data, headers: res.headers };
    } catch (error) {
      if (error.status || attempt >= retries) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}

async function fetchJson(url) {
  const res = await fetchUrl(url, { responseType: "json" });
  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  return { data, headers: res.headers };
}

module.exports = { fetchUrl, fetchJson };
