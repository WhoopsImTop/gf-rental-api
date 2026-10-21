"use strict";

const config = require("../config");
const { getSupabase, unwrap, selectAll } = require("../db");
const { embedTexts, parseVector } = require("../openaiClient");
const { collectDocuments, buildIndexContent } = require("./pipeline");
const { documentMarkdown } = require("./extractors/generic");
const { sha256, chunkArray } = require("../util");
const { logger } = require("../../logging");

const HEARTBEAT_MS = 15_000;
const STALE_AFTER_MS = 5 * 60_000;
const EMBEDDING_PRICE_PER_MTOK = 0.02; // text-embedding-3-small, USD

class SyncAlreadyRunningError extends Error {
  constructor(run) {
    super("Es läuft bereits ein Einlern-Vorgang.");
    this.name = "SyncAlreadyRunningError";
    this.run = run;
  }
}

async function updateRun(runId, patch) {
  unwrap(await getSupabase().from("kb_sync_runs").update(patch).eq("id", runId), "kb_sync_runs update");
}

/** Läufe, deren Prozess abgebrochen ist (z. B. API-Neustart), als fehlgeschlagen markieren. */
async function markStaleRuns() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const supabase = getSupabase();
  const stale = unwrap(
    await supabase
      .from("kb_sync_runs")
      .select("id, heartbeat_at, created_at")
      .in("status", ["queued", "running"]),
    "kb_sync_runs stale",
  ).filter((run) => (run.heartbeat_at || run.created_at) < cutoff);
  for (const run of stale) {
    await updateRun(run.id, { status: "failed", error: "Abgebrochen (Server-Neustart oder Zeitüberschreitung)", finished_at: new Date().toISOString() });
  }
  return stale.length;
}

async function loadPrevious(supabase) {
  const sources = await selectAll(() => supabase.from("kb_sources").select("*").order("id"), "kb_sources");
  const documents = await selectAll(
    () => supabase.from("kb_documents").select("id, source_id, version, content_hash, extracted").order("id"),
    "kb_documents",
  );
  const latestBySource = new Map();
  for (const doc of documents) {
    const current = latestBySource.get(doc.source_id);
    if (!current || doc.version > current.version) latestBySource.set(doc.source_id, doc);
  }

  const previous = new Map();
  const overrides = new Map();
  for (const source of sources) {
    if (source.override) overrides.set(source.source_key, source.override);
    const latest = latestBySource.get(source.id);
    previous.set(source.source_key, { lastmod: source.lastmod, extracted: latest?.extracted || null });
  }
  return { sources, latestBySource, previous, overrides };
}

async function upsertSources(supabase, sources, existing) {
  const now = new Date().toISOString();
  const existingByKey = new Map(existing.map((source) => [source.source_key, source]));
  // Alle Zeilen brauchen dieselben Spalten (fehlende Werte würde PostgREST auf NULL setzen).
  const rows = sources.map((source) => ({
    source_key: source.source_key,
    type: source.type,
    url: source.url,
    wp_id: source.wp_id,
    title: source.title,
    excluded_reason: source.excluded_reason || null,
    robots: source.robots,
    lastmod: source.lastmod,
    published_at: source.published_at,
    last_seen_at: now,
    last_crawled_at: source.crawled ? now : existingByKey.get(source.source_key)?.last_crawled_at || null,
    last_error: source.last_error || null,
    deleted_at: null,
    updated_at: now,
  }));
  for (const batch of chunkArray(rows, 200)) {
    unwrap(await supabase.from("kb_sources").upsert(batch, { onConflict: "source_key" }), "kb_sources upsert");
  }

  const seen = new Set(sources.map((source) => source.source_key));
  const removed = existing.filter((source) => !seen.has(source.source_key) && !source.deleted_at);
  for (const batch of chunkArray(removed.map((source) => source.id), 200)) {
    unwrap(await supabase.from("kb_sources").update({ deleted_at: now }).in("id", batch), "kb_sources delete-mark");
  }

  const all = await selectAll(() => supabase.from("kb_sources").select("id, source_key").order("id"), "kb_sources reload");
  return { idByKey: new Map(all.map((row) => [row.source_key, row.id])), removed };
}

async function storeDocuments(supabase, runId, docs, idByKey, latestBySource) {
  const changes = [];
  let unchanged = 0;
  for (const doc of docs) {
    const sourceId = idByKey.get(doc.source.source_key);
    const markdown = documentMarkdown(doc.extracted);
    const hash = sha256(markdown);
    const latest = latestBySource.get(sourceId);
    doc.sourceId = sourceId;

    if (latest && latest.content_hash === hash) {
      doc.documentId = latest.id;
      unchanged += 1;
      continue;
    }

    const inserted = unwrap(
      await supabase
        .from("kb_documents")
        .insert({
          source_id: sourceId,
          version: (latest?.version || 0) + 1,
          title: doc.source.title,
          markdown,
          extracted: doc.extracted,
          content_hash: hash,
          sync_run_id: runId,
        })
        .select("id")
        .single(),
      "kb_documents insert",
    );
    doc.documentId = inserted.id;
    changes.push({
      change: latest ? "changed" : "new",
      sourceId,
      documentId: inserted.id,
      previousDocumentId: latest?.id || null,
      title: doc.source.title,
      url: doc.source.url,
      type: doc.source.type,
    });
  }
  return { changes, unchanged };
}

async function activeVersionId(supabase) {
  const rows = unwrap(await supabase.from("kb_index_versions").select("id").eq("status", "active").limit(1), "active version");
  return rows[0]?.id || null;
}

async function reusableEmbeddings(supabase, versionId) {
  if (!versionId) return new Map();
  const rows = await selectAll(
    () => supabase.from("kb_chunks").select("content_hash, embedding").eq("index_version_id", versionId).order("id"),
    "kb_chunks embeddings",
    300,
  );
  return new Map(rows.map((row) => [row.content_hash, parseVector(row.embedding)]));
}

async function cleanupVersions(supabase) {
  const versions = unwrap(
    await supabase.from("kb_index_versions").select("id, status").neq("status", "active").order("id", { ascending: false }),
    "kb_index_versions cleanup",
  );
  const obsolete = versions.slice(config.KEEP_INDEX_VERSIONS).map((version) => version.id);
  if (obsolete.length) {
    unwrap(await supabase.from("kb_index_versions").delete().in("id", obsolete), "kb_index_versions delete");
  }
}

async function executeRun(runId, mode, triggeredBy) {
  const supabase = getSupabase();
  const startedAt = Date.now();
  let versionId = null;
  let lastProgressWrite = 0;
  const heartbeat = setInterval(() => {
    updateRun(runId, { heartbeat_at: new Date().toISOString() }).catch(() => {});
  }, HEARTBEAT_MS);

  const progress = (patch) => {
    if (Date.now() - lastProgressWrite < 2000 && patch.phase === "fetch") return;
    lastProgressWrite = Date.now();
    updateRun(runId, { phase: patch.phase, progress: patch, heartbeat_at: new Date().toISOString() }).catch(() => {});
  };

  try {
    await updateRun(runId, { status: "running", started_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), phase: "prepare" });

    const db = require("../../../models");
    const { sources: existingSources, latestBySource, previous, overrides } = await loadPrevious(supabase);
    const { sources, docs, warnings } = await collectDocuments({ mode, previous, overrides, db, onProgress: progress });

    progress({ phase: "store" });
    const { idByKey, removed } = await upsertSources(supabase, sources, existingSources);
    const { changes, unchanged } = await storeDocuments(supabase, runId, docs, idByKey, latestBySource);

    progress({ phase: "chunk" });
    const content = buildIndexContent(docs);

    progress({ phase: "embed", total: content.chunks.length });
    const reuse = await reusableEmbeddings(supabase, await activeVersionId(supabase));
    const missing = content.chunks.filter((chunk) => !reuse.has(chunk.content_hash));
    const { vectors, tokens } = await embedTexts(missing.map((chunk) => chunk.embed_text));
    missing.forEach((chunk, i) => reuse.set(chunk.content_hash, vectors[i]));

    progress({ phase: "index", total: content.chunks.length });
    const version = unwrap(
      await supabase.from("kb_index_versions").insert({ status: "building", sync_run_id: runId }).select("id").single(),
      "kb_index_versions insert",
    );
    versionId = version.id;
    const docIdBySource = new Map(docs.map((doc) => [doc.source.source_key, doc.documentId]));

    const rows = content.chunks.map((chunk) => ({
      index_version_id: versionId,
      chunk_id: chunk.chunk_id,
      source_id: idByKey.get(chunk.source_key) || null,
      document_id: chunk.document_id || docIdBySource.get(chunk.source_key) || null,
      kind: chunk.kind,
      title: chunk.title,
      section: chunk.section,
      question: chunk.question,
      content: chunk.content,
      embed_text: chunk.embed_text,
      search_text: chunk.search_text,
      embedding: reuse.get(chunk.content_hash),
      source_url: chunk.source_url,
      breadcrumb: chunk.breadcrumb,
      authority: chunk.authority,
      status: chunk.status,
      valid_from: chunk.valid_from,
      valid_until: chunk.valid_until,
      published_at: chunk.published_at,
      region: chunk.region,
      keywords: chunk.keywords,
      media: chunk.media,
      trust: chunk.trust,
      content_hash: chunk.content_hash,
      embedding_model: config.EMBEDDING_MODEL,
    }));
    for (const batch of chunkArray(rows, 50)) {
      unwrap(await supabase.from("kb_chunks").insert(batch), "kb_chunks insert");
    }
    if (content.facts.length) {
      unwrap(
        await supabase.from("kb_facts").insert(content.facts.map((fact) => ({ ...fact, index_version_id: versionId }))),
        "kb_facts insert",
      );
    }

    const allWarnings = [...warnings, ...content.warnings];
    const blockers = allWarnings.filter((warning) => warning.severity === "blocker");
    const byKind = content.chunks.reduce((acc, chunk) => ({ ...acc, [chunk.kind]: (acc[chunk.kind] || 0) + 1 }), {});
    const stats = {
      sources: sources.length,
      included: docs.length,
      excluded: sources.filter((source) => source.excluded_reason).length,
      reusedDocuments: docs.filter((doc) => doc.reused).length,
      documentsNew: changes.filter((change) => change.change === "new").length,
      documentsChanged: changes.filter((change) => change.change === "changed").length,
      documentsUnchanged: unchanged,
      sourcesRemoved: removed.map((source) => ({ id: source.id, title: source.title, url: source.url })),
      changes: changes.slice(0, 300),
      chunks: content.chunks.length,
      chunksByKind: byKind,
      embeddingsComputed: missing.length,
      embeddingsReused: content.chunks.length - missing.length,
      embeddingTokens: tokens,
      embeddingCostUsd: Number(((tokens / 1_000_000) * EMBEDDING_PRICE_PER_MTOK).toFixed(5)),
      priceVersions: content.priceVersions.map((v) => ({ label: v.label, validFrom: v.validFrom, validUntil: v.validUntil, consistent: v.consistent, url: v.url })),
      durationMs: Date.now() - startedAt,
    };

    unwrap(await supabase.from("kb_index_versions").update({ status: "ready", stats }).eq("id", versionId), "kb_index_versions ready");

    let activated = false;
    if (!blockers.length) {
      unwrap(
        await supabase.rpc("kb_activate_index_version", { p_version_id: versionId, p_activated_by: `sync:${triggeredBy || "system"}` }),
        "kb_activate_index_version",
      );
      activated = true;
    }
    await cleanupVersions(supabase);

    await updateRun(runId, {
      status: "succeeded",
      phase: "done",
      progress: { phase: "done", activated },
      stats: { ...stats, activated },
      warnings: allWarnings,
      index_version_id: versionId,
      finished_at: new Date().toISOString(),
    });
  } catch (error) {
    logger("warn", `[assistant] Sync ${runId} fehlgeschlagen: ${error.stack || error.message}`);
    if (versionId) {
      await getSupabase().from("kb_index_versions").update({ status: "failed" }).eq("id", versionId);
    }
    await updateRun(runId, { status: "failed", phase: "failed", error: error.message, finished_at: new Date().toISOString() }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
  }
}

async function createRun(mode, triggeredBy) {
  if (!["incremental", "full"].includes(mode)) throw new Error("mode muss 'incremental' oder 'full' sein");
  const supabase = getSupabase();
  await markStaleRuns();
  const { data, error } = await supabase
    .from("kb_sync_runs")
    .insert({ mode, status: "queued", triggered_by: triggeredBy || null })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const running = unwrap(
        await supabase.from("kb_sync_runs").select("*").in("status", ["queued", "running"]).limit(1),
        "running run",
      );
      throw new SyncAlreadyRunningError(running[0] || null);
    }
    throw new Error(`kb_sync_runs insert: ${error.message}`);
  }
  return data;
}

/** Startet einen Lauf im Hintergrund und gibt sofort den Run-Datensatz zurück. */
async function startSync({ mode = "incremental", triggeredBy }) {
  const run = await createRun(mode, triggeredBy);
  setImmediate(() => {
    executeRun(run.id, mode, triggeredBy).catch((error) => logger("warn", `[assistant] Sync-Fehler: ${error.message}`));
  });
  return run;
}

/** Führt einen Lauf synchron aus (CLI/Scheduler) und liefert den Endstand. */
async function runSyncNow({ mode = "incremental", triggeredBy }) {
  const run = await createRun(mode, triggeredBy);
  await executeRun(run.id, mode, triggeredBy);
  return unwrap(await getSupabase().from("kb_sync_runs").select("*").eq("id", run.id).single(), "kb_sync_runs read");
}

module.exports = { startSync, runSyncNow, markStaleRuns, SyncAlreadyRunningError };
