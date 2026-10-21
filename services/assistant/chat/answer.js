"use strict";

const config = require("../config");
const { getOpenAI } = require("../openaiClient");
const { retrieve, retrievalQuery, loadFacts, activeIndexVersion } = require("./retrieval");
const { TOOL_DEFINITIONS, runTool, ToolError } = require("./tools");
const { systemPrompt, sourcesBlock, chunkHeader, plainContent, ANSWER_SCHEMA } = require("./prompt");
const { postCheck } = require("./postCheck");
const { markdownToText } = require("../sync/extractors/markdown");

class NoIndexError extends Error {
  constructor() {
    super("Es ist noch keine Wissensbasis aktiv. Bitte zuerst die Website einlernen.");
    this.name = "NoIndexError";
  }
}

const NO_ANSWER_TEXT =
  "Dazu habe ich in den Inhalten der Grünen-Flotte-Website keine gesicherte Information gefunden. Bitte wenden Sie sich an den Kundenservice der Grünen Flotte.";
const UNVERIFIED_TEXT =
  "Ich konnte meine Antwort nicht vollständig mit den Quellen belegen und zeige sie deshalb nicht an. Bitte prüfen Sie die unten verlinkten Quellen oder wenden Sie sich an den Kundenservice.";

/** Modell-spezifische Parameter: Reasoning-Modelle kennen keine temperature. */
function modelParams(model) {
  if (/^(gpt-5|o\d)/.test(model)) return { reasoning_effort: "low" };
  return { temperature: 0.1 };
}

function addUsage(total, usage) {
  if (!usage) return total;
  return {
    prompt_tokens: (total.prompt_tokens || 0) + (usage.prompt_tokens || 0),
    completion_tokens: (total.completion_tokens || 0) + (usage.completion_tokens || 0),
    total_tokens: (total.total_tokens || 0) + (usage.total_tokens || 0),
  };
}

function parseAnswer(content) {
  try {
    const parsed = JSON.parse(content || "{}");
    return {
      answer: String(parsed.answer_markdown || "").trim(),
      confidence: ["high", "low", "none"].includes(parsed.confidence) ? parsed.confidence : "low",
      followUps: Array.isArray(parsed.follow_ups) ? parsed.follow_ups.slice(0, 3).map(String) : [],
    };
  } catch {
    return { answer: String(content || "").trim(), confidence: "low", followUps: [] };
  }
}

function citationFor(source) {
  if (source.type === "tool") {
    return { n: source.n, type: "tool", kind: "tool", title: source.title, url: source.url, breadcrumb: [source.title], snippet: source.text.slice(0, 280) };
  }
  const chunk = source.chunk;
  return {
    n: source.n,
    type: "chunk",
    kind: chunk.kind,
    chunkId: chunk.chunk_id,
    title: chunk.question || chunk.section || chunk.title,
    breadcrumb: chunk.breadcrumb,
    url: chunk.source_url,
    snippet: markdownToText(chunk.content).slice(0, 280),
    validFrom: chunk.valid_from,
    validUntil: chunk.valid_until,
    publishedAt: chunk.published_at,
  };
}

function mediaFor(sources) {
  const seen = new Set();
  const media = [];
  for (const source of sources) {
    for (const item of source.chunk?.media || []) {
      const key = item.src || item.url;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      media.push({ ...item, n: source.n });
    }
  }
  return media;
}

/** Werkzeuge werden immer mitgegeben (Verlauf enthält ggf. Tool-Calls); withTools=false erzwingt eine Textantwort. */
async function complete({ model, messages, withTools }) {
  return getOpenAI().chat.completions.create({
    model,
    messages,
    response_format: ANSWER_SCHEMA,
    max_completion_tokens: 2000,
    tools: TOOL_DEFINITIONS,
    tool_choice: withTools ? "auto" : "none",
    ...(withTools ? { parallel_tool_calls: true } : {}),
    ...modelParams(model),
  });
}

/**
 * Beantwortet eine Frage auf Basis der aktiven Index-Version.
 * @param {object} params
 * @param {string} params.message
 * @param {{role: string, content: string}[]} params.history bisherige Nachrichten (ohne Quellen)
 * @param {{model?: string, asOf: string, topK?: number}} params.options
 */
async function answerQuestion({ message, history = [], options }) {
  const startedAt = Date.now();
  const model = config.CHAT_MODELS.includes(options.model) ? options.model : config.DEFAULT_CHAT_MODEL;
  const asOf = options.asOf;
  const topK = Math.min(Math.max(Number(options.topK) || config.TOP_K, 1), 12);

  const version = await activeIndexVersion();
  if (!version) throw new NoIndexError();
  const facts = await loadFacts(version.id);

  const query = retrievalQuery(message, history);
  const retrieval = await retrieve({ query, asOf, topK, versionId: version.id });

  const sources = retrieval.chunks.map((chunk, i) => ({
    n: i + 1,
    type: "chunk",
    chunk,
    header: chunkHeader(chunk),
    text: plainContent(chunk.content),
  }));

  const recentHistory = history.slice(-config.MAX_HISTORY_MESSAGES).map((entry) => ({ role: entry.role, content: entry.content }));
  const messages = [
    { role: "system", content: systemPrompt(asOf) },
    ...recentHistory,
    { role: "system", content: sourcesBlock(sources, asOf) },
    { role: "user", content: message },
  ];

  const toolCalls = [];
  let usage = {};
  let parsed = null;

  for (let round = 0; round <= config.MAX_TOOL_ROUNDS; round += 1) {
    const res = await complete({ model, messages, withTools: round < config.MAX_TOOL_ROUNDS });
    usage = addUsage(usage, res.usage);
    const reply = res.choices[0].message;

    if (reply.tool_calls?.length) {
      messages.push(reply);
      for (const call of reply.tool_calls) {
        let args = {};
        let content;
        try {
          args = JSON.parse(call.function.arguments || "{}");
          const result = runTool(call.function.name, args, { facts, asOf });
          const n = sources.length + 1;
          sources.push({ n, type: "tool", title: result.title, url: result.url, header: `Werkzeug ${call.function.name}`, text: result.text });
          content = `Quelle [${n}] – ${result.title}:\n${result.text}`;
          toolCalls.push({ name: call.function.name, args, n, result: result.data });
        } catch (error) {
          const messageText = error instanceof ToolError ? error.message : `Interner Fehler: ${error.message}`;
          content = `Fehler: ${messageText}`;
          toolCalls.push({ name: call.function.name, args, error: messageText });
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
      continue;
    }

    parsed = parseAnswer(reply.content);
    break;
  }
  if (!parsed) parsed = { answer: "", confidence: "none", followUps: [] };

  const extraEvidence = [message, ...history.filter((entry) => entry.role === "user").map((entry) => entry.content), ...toolCalls.map((call) => JSON.stringify(call.args))];
  let check = postCheck(parsed.answer, sources, extraEvidence);
  const firstCheck = check;
  let retried = false;

  if (!check.ok && parsed.confidence !== "none") {
    retried = true;
    messages.push(
      { role: "assistant", content: JSON.stringify({ answer_markdown: parsed.answer, confidence: parsed.confidence, follow_ups: parsed.followUps }) },
      {
        role: "user",
        content: `Prüfhinweis: Diese Zahlen stehen in keiner Quelle: ${check.unverifiedNumbers.join(", ")}. Formuliere die Antwort neu und verwende nur Zahlen, die wörtlich in den Quellen oder Werkzeug-Ergebnissen stehen.`,
      },
    );
    const res = await complete({ model, messages, withTools: false });
    usage = addUsage(usage, res.usage);
    parsed = parseAnswer(res.choices[0].message.content);
    check = postCheck(parsed.answer, sources, extraEvidence);
  }

  let answer = check.text;
  let outcome = "answered";
  if (parsed.confidence === "none" || !answer) {
    outcome = "no_answer";
    answer = NO_ANSWER_TEXT;
  } else if (!check.ok && config.STRICT_POST_CHECK) {
    outcome = "blocked_unverified";
    answer = UNVERIFIED_TEXT;
  }

  const citedSources = outcome === "answered" ? sources.filter((source) => check.cited.includes(source.n)) : sources.filter((source) => source.type === "chunk").slice(0, 3);
  const citations = citedSources.map(citationFor);
  if (outcome === "no_answer") {
    citations.push({ n: null, type: "contact", kind: "contact", title: "Kundenservice (FAQ)", url: config.FALLBACK_CONTACT_URL, breadcrumb: ["FAQ", "Kundenservice"], snippet: "" });
  }

  return {
    answer,
    outcome,
    confidence: parsed.confidence,
    followUps: outcome === "answered" ? parsed.followUps : [],
    citations,
    media: mediaFor(citedSources),
    model,
    indexVersionId: version.id,
    asOf,
    usage,
    latencyMs: Date.now() - startedAt,
    debug: {
      retrievalQuery: query,
      candidates: retrieval.candidates,
      sources: sources.map((source) => ({ n: source.n, type: source.type, header: source.header, chunkId: source.chunk?.chunk_id || null, text: source.text.slice(0, 1200) })),
      toolCalls,
      postCheck: {
        retried,
        first: { unverifiedNumbers: firstCheck.unverifiedNumbers, invalidCitations: firstCheck.invalidCitations, removedLinks: firstCheck.removedLinks },
        final: { unverifiedNumbers: check.unverifiedNumbers, invalidCitations: check.invalidCitations, removedLinks: check.removedLinks },
      },
      rawAnswer: outcome === "answered" ? null : parsed.answer,
      embeddingTokens: retrieval.embeddingTokens,
    },
  };
}

module.exports = { answerQuestion, NoIndexError };
