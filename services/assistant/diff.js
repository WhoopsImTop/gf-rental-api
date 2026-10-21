"use strict";

const MAX_CELLS = 4_000_000;
const CONTEXT = 2;

/** Zeilen-Diff (LCS). Für sehr große Dokumente Fallback auf Mengenvergleich. */
function diffLines(before, after) {
  const a = String(before || "").split("\n");
  const b = String(after || "").split("\n");

  if (a.length * b.length > MAX_CELLS) {
    const setA = new Set(a);
    const setB = new Set(b);
    return [
      ...a.filter((line) => !setB.has(line)).map((text) => ({ type: "del", text })),
      ...b.filter((line) => !setA.has(line)).map((text) => ({ type: "add", text })),
    ];
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] = a[i] === b[j] ? lcs[(i + 1) * cols + j + 1] + 1 : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      out.push({ type: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ type: "del", text: a[i++] });
  while (j < b.length) out.push({ type: "add", text: b[j++] });
  return compact(out);
}

/** Unveränderte Bereiche auf wenige Kontextzeilen kürzen. */
function compact(lines) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.type === "same") return;
    for (let k = Math.max(0, index - CONTEXT); k <= Math.min(lines.length - 1, index + CONTEXT); k += 1) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped) out.push({ type: "skip", text: `… ${skipped} unveränderte Zeilen` });
      skipped = 0;
      out.push(line);
    } else {
      skipped += 1;
    }
  });
  if (skipped) out.push({ type: "skip", text: `… ${skipped} unveränderte Zeilen` });
  return out;
}

module.exports = { diffLines };
