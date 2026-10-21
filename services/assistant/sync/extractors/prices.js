"use strict";

const acorn = require("acorn");

/**
 * Preisdaten der Mietpreis-Seite stehen nicht im HTML-Text, sondern in Inline-JS:
 *   const tables = { green_membership: { tableData: [...], milage_pricing: [...] }, … }   (Anzeige-Tabelle)
 *   function berechneMietpreis(…) { const basisTarif = { XS: { nacht, tag }, …, tagesTarife, wochenTarife, kilometerTarife } }
 *   const kraftstoffzuschlag = { value, isPercent }
 *   const gfRechnerAktion = null | { aktiv, von, bis }
 * Die Objektliterale werden per AST gelesen (kein eval, kein Regex auf Zahlen).
 */

const VARIABLES = ["tables", "basisTarif", "kraftstoffzuschlag", "gfRechnerAktion", "tableClasses"];

const MEMBERSHIP_KEYS = {
  green_membership: "green",
  gold_membership: "gold",
  black_membership: "black",
};

class LiteralError extends Error {}

/** Wertet nur reine Literale aus (Objekte, Arrays, Zahlen, Strings, Booleans, null, negative Zahlen). */
function literalValue(node) {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "ArrayExpression":
      return node.elements.map((element) => (element ? literalValue(element) : null));
    case "ObjectExpression": {
      const out = {};
      for (const prop of node.properties) {
        if (prop.type !== "Property" || prop.computed) throw new LiteralError("Nicht-literale Eigenschaft");
        const key = prop.key.type === "Identifier" ? prop.key.name : String(prop.key.value);
        out[key] = literalValue(prop.value);
      }
      return out;
    }
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "Literal") return -node.argument.value;
      throw new LiteralError(`Operator ${node.operator} nicht erlaubt`);
    case "TemplateLiteral":
      if (node.expressions.length === 0) return node.quasis.map((q) => q.value.cooked).join("");
      throw new LiteralError("Template mit Ausdrücken");
    default:
      throw new LiteralError(`Knotentyp ${node.type} ist kein Literal`);
  }
}

/** Durchläuft den AST und sammelt `const <name> = <Literal>` für die gesuchten Variablen. */
function collectDeclarations(ast, names) {
  const found = {};
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && names.includes(node.id.name)) {
      if (!(node.id.name in found) && node.init) {
        try {
          found[node.id.name] = literalValue(node.init);
        } catch {
          // kein reines Literal → ignorieren
        }
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object" && typeof child.type === "string") visit(child);
    }
  };
  visit(ast);
  return found;
}

function toNumber(value) {
  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.title && row.classData && !row.isPromo)
    .map((row) => ({
      title: String(row.title).trim(),
      values: Object.fromEntries(Object.entries(row.classData).map(([cls, value]) => [cls, toNumber(value)])),
    }));
}

/** Prüft, ob der Website-Kalkulator noch die Rabatt-/Guthabenregeln enthält, die estimate_price nachbildet. */
function verifyCalculatorLogic(code) {
  const checks = {
    timeDiscountGoldBlack: /gold_membership'\s*\|\|\s*selectedMembersip\s*===\s*'black_membership'\)\s*\{\s*zeitPreis\s*\*=\s*0\.9/.test(code),
    kmDiscountBlack: /selectedMembersip\s*===\s*'black_membership'\)\s*\{\s*kmPreis\s*\*=\s*0\.9/.test(code),
    creditGold: /gold_membership'\)\s*\{\s*fahrtguthaben\s*=\s*10;/.test(code),
    creditBlack: /black_membership'\)\s*\{\s*fahrtguthaben\s*=\s*30;/.test(code),
    nightHours: /stunde\s*>=\s*0\s*&&\s*stunde\s*<\s*7/.test(code),
    kmTierAt100: /kilometer\s*<=\s*100/.test(code),
    hourCapAtDay: /stundenKosten\s*>\s*tagesPreis/.test(code),
    promoShortensBy24h: /dauerStunden\s*>=\s*96\s*&&\s*dauerStunden\s*<=\s*120/.test(code),
  };
  return { verified: Object.values(checks).every(Boolean), checks };
}

/**
 * @param {string[]} scripts Inline-Skripte der Seite
 * @returns {null | object} strukturierte Preisdaten oder null, wenn die Seite keine enthält
 */
function extractPrices(scripts) {
  const declarations = {};
  let calculatorCode = "";

  for (const code of scripts) {
    if (/function\s+berechneMietpreis/.test(code)) calculatorCode = code;
    let ast;
    try {
      ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true });
    } catch {
      continue;
    }
    const found = collectDeclarations(ast, VARIABLES);
    for (const [name, value] of Object.entries(found)) {
      if (!(name in declarations)) declarations[name] = value;
    }
  }

  if (!declarations.tables && !declarations.basisTarif) return null;

  const tariffs = {};
  for (const [membership, key] of Object.entries(MEMBERSHIP_KEYS)) {
    const table = declarations.tables?.[membership];
    if (!table) continue;
    tariffs[key] = {
      time: normalizeRows(table.tableData),
      km: normalizeRows(table.milage_pricing),
    };
  }

  const basis = declarations.basisTarif;
  let calculator = null;
  if (basis) {
    const classes = Object.keys(basis).filter((key) => basis[key] && typeof basis[key].tag === "number");
    calculator = {
      classes,
      hourly: Object.fromEntries(classes.map((cls) => [cls, { night: basis[cls].nacht, day: basis[cls].tag }])),
      daily: basis.tagesTarife || {},
      weekly: basis.wochenTarife || {},
      km: {
        upTo100: basis.kilometerTarife?.unter100 || {},
        above100: basis.kilometerTarife?.ueber100 || {},
      },
    };
  }

  const fuel = declarations.kraftstoffzuschlag;
  const promo = declarations.gfRechnerAktion;

  return {
    classes: (declarations.tableClasses || []).map((entry) => entry.name).filter(Boolean),
    tariffs,
    calculator,
    fuelSurcharge: fuel && typeof fuel.value === "number" ? { value: fuel.value, isPercent: Boolean(fuel.isPercent) } : null,
    promo: promo && typeof promo === "object" ? promo : null,
    calculatorLogic: calculatorCode ? verifyCalculatorLogic(calculatorCode) : { verified: false, checks: {} },
  };
}

module.exports = { extractPrices, literalValue, verifyCalculatorLogic };
