#!/usr/bin/env node
"use strict";

/**
 * Website für den Carsharing-Assistenten einlernen.
 *
 *   node scripts/assistant-sync.js --dry-run [--out <ordner>] [--with-vehicles]
 *       Crawlt + extrahiert + chunkt ohne Supabase/OpenAI und schreibt das Ergebnis als Dateien.
 *   node scripts/assistant-sync.js --mode full|incremental
 *       Echter Sync (wie der Button im CRM): Embeddings, neue Index-Version, ggf. Aktivierung.
 */
require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

async function dryRun() {
  const { collectDocuments, buildIndexContent } = require("../services/assistant/sync/pipeline");
  const { documentMarkdown } = require("../services/assistant/sync/extractors/generic");
  const { slugify } = require("../services/assistant/util");

  const outDir = path.resolve(option("--out", path.join(os.tmpdir(), "assistant-dry-run")));
  fs.mkdirSync(path.join(outDir, "documents"), { recursive: true });

  const db = flag("--with-vehicles") ? require("../models") : null;
  let lastPhase = "";
  const { sources, docs, warnings } = await collectDocuments({
    mode: "full",
    db,
    onProgress: (progress) => {
      if (progress.phase !== lastPhase || (progress.done ?? 0) % 25 === 0) {
        console.log(`[${progress.phase}] ${progress.done ?? ""}${progress.total ? `/${progress.total}` : ""}`);
        lastPhase = progress.phase;
      }
    },
  });
  const content = buildIndexContent(docs);

  for (const doc of docs) {
    const file = `${slugify(doc.source.source_key)}-${slugify(doc.source.title, 40)}.md`;
    fs.writeFileSync(path.join(outDir, "documents", file), `# ${doc.source.title}\n\n${doc.source.url}\n\n${documentMarkdown(doc.extracted)}\n`);
  }
  fs.writeFileSync(path.join(outDir, "sources.json"), JSON.stringify(sources, null, 2));
  fs.writeFileSync(path.join(outDir, "chunks.jsonl"), content.chunks.map((chunk) => JSON.stringify(chunk)).join("\n"));
  fs.writeFileSync(path.join(outDir, "facts.json"), JSON.stringify(content.facts, null, 2));
  fs.writeFileSync(path.join(outDir, "warnings.json"), JSON.stringify([...warnings, ...content.warnings], null, 2));

  const byKind = content.chunks.reduce((acc, chunk) => ({ ...acc, [chunk.kind]: (acc[chunk.kind] || 0) + 1 }), {});
  const chars = content.chunks.reduce((sum, chunk) => sum + chunk.embed_text.length, 0);
  console.log("\nQuellen:", sources.length, "| eingelernt:", docs.length, "| ausgeschlossen:", sources.filter((s) => s.excluded_reason).length);
  console.log("Chunks:", content.chunks.length, byKind, `| ~${Math.round(chars / 3.8 / 1000)}k Tokens`);
  console.log("Preisversionen:", content.priceVersions.map((v) => `${v.label} [${v.validFrom} – ${v.validUntil || "offen"}] konsistent=${v.consistent}`));
  for (const warning of [...warnings, ...content.warnings]) console.log(`! [${warning.severity}] ${warning.message}`);
  console.log(`\nErgebnis: ${outDir}`);
  if (db) await db.sequelize.close();
}

async function realSync() {
  const { runSyncNow } = require("../services/assistant/sync/syncRunner");
  const db = require("../models");
  const mode = option("--mode", "incremental");
  const run = await runSyncNow({ mode, triggeredBy: "cli" });
  console.log(JSON.stringify(run, null, 2));
  await db.sequelize.close();
}

(flag("--dry-run") ? dryRun() : realSync()).catch((error) => {
  console.error(error);
  process.exit(1);
});
