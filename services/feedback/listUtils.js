/** Listen in CRM: Semikolon (Komma nur für Alt-Daten beim Parsen). */
const LIST_SEPARATOR = ";";

function splitSemicolonList(raw) {
  if (raw == null || typeof raw !== "string") return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const sep = trimmed.includes(";") ? ";" : ",";
  return trimmed.split(sep).map((s) => s.trim()).filter(Boolean);
}

function joinSemicolonList(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.join("; ");
}

module.exports = {
  LIST_SEPARATOR,
  splitSemicolonList,
  joinSemicolonList,
};
