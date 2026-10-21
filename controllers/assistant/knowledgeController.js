"use strict";

const config = require("../../services/assistant/config");
const { getSupabase, unwrap, selectAll } = require("../../services/assistant/db");
const { startSync, SyncAlreadyRunningError } = require("../../services/assistant/sync/syncRunner");
const { retrieve } = require("../../services/assistant/chat/retrieval");
const { diffLines } = require("../../services/assistant/diff");
const { todayIso } = require("../../services/assistant/util");
const { handleError } = require("./chatController");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function userLabel(req) {
  return `user:${req.user.id}`;
}

exports.listSources = async (req, res) => {
  try {
    const supabase = getSupabase();
    const sources = await selectAll(
      () => supabase.from("kb_sources").select("*").is("deleted_at", null).order("type").order("title"),
      "kb_sources list",
    );
    const active = unwrap(await supabase.from("kb_index_versions").select("id").eq("status", "active").limit(1), "active")[0];
    const counts = new Map();
    if (active) {
      const chunks = await selectAll(
        () => supabase.from("kb_chunks").select("source_id").eq("index_version_id", active.id).order("id"),
        "kb_chunks count",
        1000,
      );
      for (const chunk of chunks) counts.set(chunk.source_id, (counts.get(chunk.source_id) || 0) + 1);
    }
    res.json(
      sources.map((source) => ({
        ...source,
        included: source.override === "include" || (source.override !== "exclude" && !source.excluded_reason),
        chunkCount: counts.get(source.id) || 0,
      })),
    );
  } catch (error) {
    handleError(res, error, "sources");
  }
};

exports.updateSource = async (req, res) => {
  const override = req.body?.override ?? null;
  if (![null, "include", "exclude"].includes(override)) {
    return res.status(400).json({ error: "override muss include, exclude oder null sein." });
  }
  try {
    const updated = unwrap(
      await getSupabase()
        .from("kb_sources")
        .update({ override, updated_at: new Date().toISOString() })
        .eq("id", Number(req.params.id))
        .select("*")
        .single(),
      "kb_sources update",
    );
    res.json(updated);
  } catch (error) {
    handleError(res, error, "update source");
  }
};

exports.startSync = async (req, res) => {
  const mode = req.body?.mode === "full" ? "full" : "incremental";
  try {
    const run = await startSync({ mode, triggeredBy: userLabel(req) });
    res.status(202).json(run);
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return res.status(409).json({ error: error.message, run: error.run });
    }
    handleError(res, error, "start sync");
  }
};

exports.listRuns = async (req, res) => {
  try {
    const runs = unwrap(
      await getSupabase()
        .from("kb_sync_runs")
        .select("id, mode, status, phase, progress, error, triggered_by, index_version_id, started_at, finished_at, created_at, warnings")
        .order("id", { ascending: false })
        .limit(20),
      "kb_sync_runs list",
    );
    res.json(runs.map((run) => ({ ...run, warningCount: (run.warnings || []).length, blockerCount: (run.warnings || []).filter((w) => w.severity === "blocker").length, warnings: undefined })));
  } catch (error) {
    handleError(res, error, "runs");
  }
};

exports.getRun = async (req, res) => {
  try {
    const run = unwrap(await getSupabase().from("kb_sync_runs").select("*").eq("id", Number(req.params.id)).single(), "kb_sync_runs read");
    res.json(run);
  } catch (error) {
    handleError(res, error, "run");
  }
};

exports.listVersions = async (req, res) => {
  try {
    const versions = unwrap(
      await getSupabase()
        .from("kb_index_versions")
        .select("id, status, sync_run_id, stats, created_at, activated_at, activated_by")
        .order("id", { ascending: false })
        .limit(20),
      "kb_index_versions list",
    );
    res.json(
      versions.map((version) => ({
        ...version,
        stats: version.stats
          ? { chunks: version.stats.chunks, chunksByKind: version.stats.chunksByKind, priceVersions: version.stats.priceVersions, included: version.stats.included }
          : {},
      })),
    );
  } catch (error) {
    handleError(res, error, "versions");
  }
};

exports.activateVersion = async (req, res) => {
  try {
    unwrap(
      await getSupabase().rpc("kb_activate_index_version", { p_version_id: Number(req.params.id), p_activated_by: userLabel(req) }),
      "kb_activate_index_version",
    );
    res.json({ ok: true });
  } catch (error) {
    if (/nicht aktivierbar/.test(error.message)) return res.status(400).json({ error: "Diese Index-Version kann nicht aktiviert werden." });
    handleError(res, error, "activate");
  }
};

exports.documentDiff = async (req, res) => {
  try {
    const supabase = getSupabase();
    const doc = unwrap(
      await supabase.from("kb_documents").select("id, source_id, version, title, markdown, created_at").eq("id", Number(req.params.id)).single(),
      "kb_documents read",
    );
    const previous = unwrap(
      await supabase
        .from("kb_documents")
        .select("id, version, markdown, created_at")
        .eq("source_id", doc.source_id)
        .lt("version", doc.version)
        .order("version", { ascending: false })
        .limit(1),
      "kb_documents previous",
    )[0];
    res.json({
      document: { id: doc.id, version: doc.version, title: doc.title, createdAt: doc.created_at },
      previous: previous ? { id: previous.id, version: previous.version, createdAt: previous.created_at } : null,
      lines: diffLines(previous?.markdown || "", doc.markdown),
    });
  } catch (error) {
    handleError(res, error, "diff");
  }
};

exports.listChunks = async (req, res) => {
  try {
    const supabase = getSupabase();
    let versionId = Number(req.query.versionId) || null;
    if (!versionId) {
      versionId = unwrap(await supabase.from("kb_index_versions").select("id").eq("status", "active").limit(1), "active")[0]?.id;
    }
    if (!versionId) return res.json({ versionId: null, total: 0, items: [] });

    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = 50;
    let query = supabase
      .from("kb_chunks")
      .select("id, chunk_id, kind, title, section, question, content, source_url, breadcrumb, authority, valid_from, valid_until, published_at, media", { count: "exact" })
      .eq("index_version_id", versionId)
      .order("id")
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (req.query.kind) query = query.eq("kind", String(req.query.kind));
    if (req.query.sourceId) query = query.eq("source_id", Number(req.query.sourceId));
    if (req.query.q) query = query.ilike("search_text", `%${String(req.query.q).replace(/[%_]/g, "")}%`);
    const { data, count, error } = await query;
    if (error) throw new Error(`kb_chunks list: ${error.message}`);
    res.json({ versionId, total: count || 0, page, pageSize, items: data });
  } catch (error) {
    handleError(res, error, "chunks");
  }
};

exports.searchTest = async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) return res.status(400).json({ error: "Bitte einen Suchtext angeben." });
  const asOf = DATE_RE.test(req.body?.asOfDate || "") ? req.body.asOfDate : todayIso();
  try {
    const result = await retrieve({ query, asOf, topK: Math.min(Number(req.body?.topK) || config.TOP_K, 20), versionId: null });
    res.json({ asOf, candidates: result.candidates });
  } catch (error) {
    handleError(res, error, "search");
  }
};
