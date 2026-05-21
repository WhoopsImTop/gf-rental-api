const SCALE_DEFAULTS = {
  rating: { display: "stars", min: 1, max: 5 },
  nps: {
    display: "scale",
    min: 0,
    max: 10,
    labelMin: "überhaupt nicht",
    labelMax: "sehr wahrscheinlich",
  },
};

function trimLabel(value) {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s.length ? s : undefined;
}

const { splitSemicolonList } = require("./listUtils");

const DEFAULT_EMOJIS_5 = ["😡", "😕", "😐", "🙂", "😄"];
const DEFAULT_EMOJIS_3 = ["😞", "😐", "😄"];

function defaultEmojis(count) {
  if (count <= 3) return DEFAULT_EMOJIS_3.slice(0, count);
  if (count <= 5) return DEFAULT_EMOJIS_5.slice(0, count);
  const out = [...DEFAULT_EMOJIS_5];
  while (out.length < count) out.push("😐");
  return out.slice(0, count);
}

function clampScale(cfg) {
  const out = { ...cfg };
  out.min = Math.round(Number(out.min));
  out.max = Math.round(Number(out.max));
  if (!Number.isFinite(out.min)) out.min = 0;
  if (!Number.isFinite(out.max)) out.max = 5;
  if (out.min > out.max) {
    const t = out.min;
    out.min = out.max;
    out.max = t;
  }
  const span = out.max - out.min;
  if (span > 10) out.max = out.min + 10;
  if (span < 1) out.max = out.min + 1;
  if (!["scale", "stars", "emoji"].includes(out.display)) {
    out.display = SCALE_DEFAULTS.rating.display;
  }
  if (out.display === "emoji") {
    const need = out.max - out.min + 1;
    let emojis = out.emojis;
    if (typeof emojis === "string") {
      emojis = splitSemicolonList(emojis);
    }
    if (!Array.isArray(emojis) || emojis.length !== need) {
      out.emojis = defaultEmojis(need);
    } else {
      out.emojis = emojis;
    }
  }
  out.labelMin = trimLabel(out.labelMin);
  out.labelMax = trimLabel(out.labelMax);
  if (out.display !== "scale") {
    delete out.labelMin;
    delete out.labelMax;
  }
  return out;
}

function parseScaleConfig(raw, questionType) {
  const base = { ...(SCALE_DEFAULTS[questionType] || SCALE_DEFAULTS.rating) };
  let config = raw;
  if (typeof raw === "string") {
    try {
      config = JSON.parse(raw);
    } catch {
      config = null;
    }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return clampScale(base);
  }
  return clampScale({
    display: config.display ?? base.display,
    min: config.min ?? base.min,
    max: config.max ?? base.max,
    emojis: config.emojis,
    labelMin: config.labelMin ?? config.label_min,
    labelMax: config.labelMax ?? config.label_max,
  });
}

function buildScaleOptions({ display, min, max, emojis, labelMin, labelMax }) {
  const cfg = clampScale({
    display,
    min,
    max,
    emojis,
    labelMin,
    labelMax,
  });
  const out = {
    display: cfg.display,
    min: cfg.min,
    max: cfg.max,
  };
  if (cfg.display === "emoji" && cfg.emojis) {
    out.emojis = cfg.emojis;
  }
  if (cfg.display === "scale") {
    if (cfg.labelMin) out.labelMin = cfg.labelMin;
    if (cfg.labelMax) out.labelMax = cfg.labelMax;
  }
  return out;
}

function scaleConfigLabel(cfg, questionType) {
  const c = parseScaleConfig(cfg, questionType);
  const span = `${c.min}–${c.max}`;
  if (c.display === "stars") return `Sterne ${span}`;
  if (c.display === "emoji") return `Emoji ${span}`;
  return `Skala ${span}`;
}

module.exports = {
  parseScaleConfig,
  buildScaleOptions,
  scaleConfigLabel,
  SCALE_DEFAULTS,
};
