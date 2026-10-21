"use strict";

const OpenAI = require("openai");
const config = require("./config");
const { chunkArray } = require("./util");

let client = null;

function getOpenAI() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Embeddings in Batches; Reihenfolge entspricht der Eingabe. */
async function embedTexts(texts) {
  const vectors = [];
  let tokens = 0;
  for (const batch of chunkArray(texts, config.EMBEDDING_BATCH_SIZE)) {
    const res = await getOpenAI().embeddings.create({ model: config.EMBEDDING_MODEL, input: batch });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    vectors.push(...sorted.map((row) => row.embedding));
    tokens += res.usage?.total_tokens || 0;
  }
  return { vectors, tokens };
}

/** pgvector liefert Vektoren über PostgREST als String "[0.1,0.2,…]". */
function parseVector(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return JSON.parse(value);
  return null;
}

module.exports = { getOpenAI, embedTexts, parseVector };
