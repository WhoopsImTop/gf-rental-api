"use strict";

const config = require("../../services/assistant/config");
const { getSupabase, unwrap, isConfigured, AssistantNotConfiguredError } = require("../../services/assistant/db");
const { answerQuestion, NoIndexError } = require("../../services/assistant/chat/answer");
const { activeIndexVersion } = require("../../services/assistant/chat/retrieval");
const { todayIso } = require("../../services/assistant/util");
const { logger } = require("../../services/logging");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGE_LENGTH = 2000;
const FEEDBACK_REASONS = ["falsch", "unvollstaendig", "falsche_quelle", "veraltet", "zu_lang", "sonstiges"];

function handleError(res, error, context) {
  if (error instanceof AssistantNotConfiguredError) return res.status(503).json({ error: error.message });
  if (error instanceof NoIndexError) return res.status(409).json({ error: error.message });
  if (error.code === "PGRST205" || error.code === "PGRST202") {
    return res.status(503).json({
      error: "Datenbank des Assistenten nicht eingerichtet: Migration 20261008120000_create_kb_assistant.sql im Supabase-Projekt ausführen.",
    });
  }
  logger("warn", `[assistant] ${context}: ${error.stack || error.message}`);
  return res.status(500).json({ error: "Interner Fehler im Assistenten." });
}

async function findOwnConversation(conversationId, userId) {
  const rows = unwrap(
    await getSupabase().from("kb_conversations").select("*").eq("id", conversationId).eq("user_id", userId).limit(1),
    "kb_conversations read",
  );
  return rows[0] || null;
}

exports.getConfig = async (req, res) => {
  try {
    const configured = isConfigured();
    const version = configured ? await activeIndexVersion() : null;
    res.json({
      configured,
      models: config.CHAT_MODELS,
      defaultModel: config.DEFAULT_CHAT_MODEL,
      topK: config.TOP_K,
      today: todayIso(),
      strictPostCheck: config.STRICT_POST_CHECK,
      activeVersion: version ? { id: version.id, activatedAt: version.activated_at, chunks: version.stats?.chunks ?? null } : null,
    });
  } catch (error) {
    console.log(error)
    handleError(res, error, "config");
  }
};

exports.chat = async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Bitte eine Frage mit 1–${MAX_MESSAGE_LENGTH} Zeichen eingeben.` });
  }
  const options = req.body?.options || {};
  const asOf = DATE_RE.test(options.asOfDate || "") ? options.asOfDate : todayIso();

  try {
    const supabase = getSupabase();
    let conversation = null;
    if (req.body?.conversationId) {
      conversation = await findOwnConversation(String(req.body.conversationId), req.user.id);
      if (!conversation) return res.status(404).json({ error: "Unterhaltung nicht gefunden." });
    } else {
      conversation = unwrap(
        await supabase.from("kb_conversations").insert({ user_id: req.user.id, title: message.slice(0, 80) }).select("*").single(),
        "kb_conversations insert",
      );
    }

    const history = unwrap(
      await supabase
        .from("kb_messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(50),
      "kb_messages history",
    );

    unwrap(
      await supabase.from("kb_messages").insert({ conversation_id: conversation.id, role: "user", content: message, as_of_date: asOf }),
      "kb_messages insert user",
    );

    const result = await answerQuestion({
      message,
      history,
      options: { model: options.model, asOf, topK: options.topK },
    });

    const saved = unwrap(
      await supabase
        .from("kb_messages")
        .insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          media: result.media,
          debug: { ...result.debug, outcome: result.outcome, confidence: result.confidence, followUps: result.followUps },
          model: result.model,
          index_version_id: result.indexVersionId,
          as_of_date: asOf,
          latency_ms: result.latencyMs,
          usage: result.usage,
        })
        .select("id, created_at")
        .single(),
      "kb_messages insert assistant",
    );
    unwrap(
      await supabase.from("kb_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversation.id),
      "kb_conversations touch",
    );

    res.json({
      conversationId: conversation.id,
      messageId: saved.id,
      createdAt: saved.created_at,
      answer: result.answer,
      outcome: result.outcome,
      confidence: result.confidence,
      followUps: result.followUps,
      citations: result.citations,
      media: result.media,
      model: result.model,
      indexVersionId: result.indexVersionId,
      asOf,
      latencyMs: result.latencyMs,
      usage: result.usage,
      debug: options.debug ? result.debug : undefined,
    });
  } catch (error) {
    handleError(res, error, "chat");
  }
};

exports.listConversations = async (req, res) => {
  try {
    const rows = unwrap(
      await getSupabase()
        .from("kb_conversations")
        .select("id, title, created_at, updated_at")
        .eq("user_id", req.user.id)
        .order("updated_at", { ascending: false })
        .limit(50),
      "kb_conversations list",
    );
    res.json(rows);
  } catch (error) {
    handleError(res, error, "conversations");
  }
};

exports.getConversation = async (req, res) => {
  try {
    const conversation = await findOwnConversation(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: "Unterhaltung nicht gefunden." });
    const supabase = getSupabase();
    const messages = unwrap(
      await supabase
        .from("kb_messages")
        .select("id, role, content, citations, media, debug, model, index_version_id, as_of_date, latency_ms, usage, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true }),
      "kb_messages list",
    );
    const ids = messages.filter((message) => message.role === "assistant").map((message) => message.id);
    const feedback = ids.length
      ? unwrap(
          await supabase.from("kb_feedback").select("message_id, rating, reason, comment, expected_answer").in("message_id", ids).eq("user_id", req.user.id),
          "kb_feedback list",
        )
      : [];
    const feedbackById = new Map(feedback.map((entry) => [entry.message_id, entry]));
    res.json({
      ...conversation,
      messages: messages.map((message) => ({ ...message, feedback: feedbackById.get(message.id) || null })),
    });
  } catch (error) {
    handleError(res, error, "conversation");
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const conversation = await findOwnConversation(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: "Unterhaltung nicht gefunden." });
    unwrap(await getSupabase().from("kb_conversations").delete().eq("id", conversation.id), "kb_conversations delete");
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error, "delete conversation");
  }
};

exports.saveFeedback = async (req, res) => {
  const messageId = Number(req.params.id);
  const rating = Number(req.body?.rating);
  if (!Number.isInteger(messageId) || ![1, -1].includes(rating)) {
    return res.status(400).json({ error: "rating muss 1 oder -1 sein." });
  }
  const reason = FEEDBACK_REASONS.includes(req.body?.reason) ? req.body.reason : null;
  const text = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

  try {
    const supabase = getSupabase();
    const rows = unwrap(
      await supabase.from("kb_messages").select("id, conversation_id, role, content, model, index_version_id, created_at").eq("id", messageId).limit(1),
      "kb_messages read",
    );
    const message = rows[0];
    if (!message || message.role !== "assistant" || !(await findOwnConversation(message.conversation_id, req.user.id))) {
      return res.status(404).json({ error: "Nachricht nicht gefunden." });
    }
    const question = unwrap(
      await supabase
        .from("kb_messages")
        .select("content")
        .eq("conversation_id", message.conversation_id)
        .eq("role", "user")
        .lt("created_at", message.created_at)
        .order("created_at", { ascending: false })
        .limit(1),
      "kb_messages question",
    )[0];

    const saved = unwrap(
      await supabase
        .from("kb_feedback")
        .upsert(
          {
            message_id: message.id,
            user_id: req.user.id,
            rating,
            reason,
            comment: text(req.body?.comment, 2000),
            expected_answer: text(req.body?.expectedAnswer, 4000),
            question: question?.content || null,
            answer: message.content,
            model: message.model,
            index_version_id: message.index_version_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "message_id,user_id" },
        )
        .select("*")
        .single(),
      "kb_feedback upsert",
    );
    res.json(saved);
  } catch (error) {
    handleError(res, error, "feedback");
  }
};

exports.listFeedback = async (req, res) => {
  try {
    let query = getSupabase()
      .from("kb_feedback")
      .select("id, message_id, rating, reason, comment, expected_answer, question, answer, model, index_version_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (req.query.rating === "-1" || req.query.rating === "1") query = query.eq("rating", Number(req.query.rating));
    res.json(unwrap(await query, "kb_feedback list"));
  } catch (error) {
    handleError(res, error, "feedback list");
  }
};

exports.handleError = handleError;
