"use strict";

const config = require("../config");
const { getSupabase, unwrap } = require("../db");
const { embedTexts } = require("../openaiClient");

const factsCache = new Map();

async function activeIndexVersion() {
  const rows = unwrap(
    await getSupabase().from("kb_index_versions").select("id, activated_at, stats").eq("status", "active").limit(1),
    "active index version",
  );
  return rows[0] || null;
}

/** Strukturierte Fakten einer Index-Version (Versionen sind unveränderlich → Cache). */
async function loadFacts(versionId) {
  if (factsCache.has(versionId)) return factsCache.get(versionId);
  const facts = unwrap(
    await getSupabase().from("kb_facts").select("key, label, valid_from, valid_until, data, source_url").eq("index_version_id", versionId),
    "kb_facts",
  );
  factsCache.set(versionId, facts);
  if (factsCache.size > 5) factsCache.delete(factsCache.keys().next().value);
  return facts;
}

/** Kurze Rückfragen ("und am Wochenende?") mit der vorherigen Nutzerfrage anreichern. */
function retrievalQuery(message, history) {
  const previousUser = [...history].reverse().find((entry) => entry.role === "user");
  if (previousUser && message.length < 60) return `${previousUser.content}\n${message}`;
  return message;
}

/**
 * Hybrid-Suche (Vektor + Volltext, RRF, Autorität) zum Stichtag.
 * Chunks unterhalb der Mindestähnlichkeit werden verworfen, außer sie haben zusätzlich einen Volltexttreffer.
 */
async function retrieve({ query, asOf, topK, versionId }) {
  const { vectors, tokens } = await embedTexts([query]);
  const rows = unwrap(
    await getSupabase().rpc("kb_search", {
      query_embedding: vectors[0],
      query_text: query,
      match_count: Math.max(topK * 2, 10),
      as_of: asOf,
      version_id: versionId,
      kinds: null,
    }),
    "kb_search",
  );

  const relevant = rows.filter((row) => {
    const similarity = row.vector_similarity ?? 0;
    if (similarity >= config.MIN_VECTOR_SIMILARITY) return true;
    return row.text_rank != null && similarity >= config.MIN_VECTOR_SIMILARITY - 0.1;
  });

  return {
    chunks: relevant.slice(0, topK),
    candidates: rows.map((row) => ({
      chunkId: row.chunk_id,
      title: row.title,
      section: row.section,
      kind: row.kind,
      vectorSimilarity: row.vector_similarity,
      textRank: row.text_rank,
      score: row.score,
      used: relevant.slice(0, topK).some((chunk) => chunk.id === row.id),
    })),
    embeddingTokens: tokens,
  };
}

module.exports = { retrieve, retrievalQuery, loadFacts, activeIndexVersion };
