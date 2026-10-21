"use strict";

const { createClient } = require("@supabase/supabase-js");
const config = require("./config");

let client = null;

class AssistantNotConfiguredError extends Error {
  constructor() {
    super("Assistent nicht konfiguriert: ASSISTANT_SUPABASE_URL / ASSISTANT_SUPABASE_SERVICE_ROLE_KEY fehlen.");
    this.name = "AssistantNotConfiguredError";
  }
}

function isConfigured() {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY && process.env.OPENAI_API_KEY);
}

/** Supabase-Client mit Service-Role (nur serverseitig, nie ans CRM ausliefern). */
function getSupabase() {
  if (!isConfigured()) throw new AssistantNotConfiguredError();
  if (!client) {
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Wirft bei Supabase-Fehlern, statt sie still zu ignorieren. */
function unwrap({ data, error }, context) {
  if (error) {
    const err = new Error(`${context}: ${error.message}`);
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}

/** Liest alle Zeilen einer Abfrage seitenweise (PostgREST liefert max. 1000 je Request). */
async function selectAll(buildQuery, context, pageSize = 500) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await buildQuery().range(from, from + pageSize - 1), context);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

module.exports = { getSupabase, isConfigured, unwrap, selectAll, AssistantNotConfiguredError };
