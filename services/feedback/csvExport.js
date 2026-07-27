const SESSION_COLUMNS = [
  { key: "session_id", header: "Session-ID" },
  { key: "submitted_at", header: "Eingereicht am" },
  { key: "respondent_email", header: "E-Mail" },
  { key: "respondent_name", header: "Name" },
  { key: "external_reference_id", header: "Referenz" },
  { key: "kanban_status", header: "Kanban-Status" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function escapeCsvCell(value) {
  const str = value == null ? "" : String(value);
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseExportDateRange(from, to) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { error: "from und to müssen im Format YYYY-MM-DD angegeben werden." };
  }
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return { error: "Ungültiges Datum für from oder to." };
  }
  if (fromDate > toDate) {
    return { error: "from darf nicht nach to liegen." };
  }
  return { fromDate, toDate };
}

function parseColumnKeys(columnsQuery) {
  if (columnsQuery == null || columnsQuery === "") return null;
  const keys = String(columnsQuery)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return keys.length ? keys : null;
}

/**
 * @param {Array<{ id: string, question_text: string }>} questions
 * @param {string[] | null} requestedKeys
 */
function resolveExportColumns(questions, requestedKeys) {
  const questionCols = questions.map((q) => ({
    key: `q_${q.id}`,
    header: q.question_text || `Frage ${q.id}`,
    questionId: q.id,
  }));
  const all = [...SESSION_COLUMNS, ...questionCols];
  if (!requestedKeys) return all;

  const byKey = new Map(all.map((c) => [c.key, c]));
  const selected = [];
  for (const key of requestedKeys) {
    const col = byKey.get(key);
    if (col) selected.push(col);
  }
  return selected;
}

function formatSubmittedAt(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

/**
 * @param {object} opts
 * @param {Array} opts.sessions - plain session objects with answers
 * @param {Array} opts.questions
 * @param {string[] | null} opts.columnKeys
 * @param {(metadata: unknown) => string} opts.resolveKanbanStatus
 */
function buildFeedbackCsv({
  sessions,
  questions,
  columnKeys,
  resolveKanbanStatus,
}) {
  const columns = resolveExportColumns(questions, columnKeys);
  if (!columns.length) {
    return { error: "Keine gültigen Spalten ausgewählt." };
  }

  const header = columns.map((c) => escapeCsvCell(c.header)).join(";");
  const lines = [header];

  for (const session of sessions) {
    const answersByQuestion = {};
    for (const answer of session.answers || []) {
      answersByQuestion[answer.question_id] = answer.value ?? "";
    }

    const kanban =
      session.kanban_status ||
      (typeof resolveKanbanStatus === "function"
        ? resolveKanbanStatus(session.metadata)
        : "");

    const row = columns.map((col) => {
      let value = "";
      if (col.questionId) {
        value = answersByQuestion[col.questionId] ?? "";
      } else {
        switch (col.key) {
          case "session_id":
            value = session.id ?? "";
            break;
          case "submitted_at":
            value = formatSubmittedAt(session.submitted_at);
            break;
          case "respondent_email":
            value = session.respondent_email ?? "";
            break;
          case "respondent_name":
            value = session.respondent_name ?? "";
            break;
          case "external_reference_id":
            value = session.external_reference_id ?? "";
            break;
          case "kanban_status":
            value = kanban ?? "";
            break;
          default:
            value = "";
        }
      }
      return escapeCsvCell(value);
    });
    lines.push(row.join(";"));
  }

  // UTF-8 BOM for Excel compatibility
  const csv = `\uFEFF${lines.join("\r\n")}`;
  return { csv, columns };
}

module.exports = {
  SESSION_COLUMNS,
  DATE_RE,
  parseExportDateRange,
  parseColumnKeys,
  resolveExportColumns,
  buildFeedbackCsv,
  escapeCsvCell,
};
