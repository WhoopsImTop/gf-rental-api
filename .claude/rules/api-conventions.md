# API-Konventionen (gf-rental-api)

Dieses Regelwerk beschreibt, wie die APIs von Grüne Flotte gebaut sind. Halte dich daran, auch wenn du es anders besser fändest. Ziel ist Konsistenz mit dem bestehenden Code, nicht Best Practice. Weiche nur ab, wenn der Auftrag es ausdrücklich verlangt.

Neuer Code orientiert sich an den neuesten Dateien, nicht an den ältesten. Gute Vorlagen:
- `controllers/carAboFolderController.js` + `routes/carAboFolderRoute.js` (CRUD, Validierung, Transaktion)
- `controllers/followupController.js` (Pagination, Filter, Payload-Validierung)
- `test/carAboFolders/carAboFolderController.test.js` (Tests)

Ältere Dateien (`statusController`, `reviewController`, `brandController`) sind **nicht** Vorlage: Antworten mit `send("Text")`, `req.body` ungefiltert in `create()`, falsche Statuscodes. Bestehenden Code dieser Art nicht ungefragt umbauen.

---

## 1. Stack

- Node.js, **CommonJS** (`require` / `module.exports`), kein TypeScript, kein Build-Schritt
- Express 4, Sequelize 6 mit MySQL/MariaDB, `sequelize-cli` für Migrations
- Tests mit dem eingebauten `node:test` + `node:assert/strict`, kein Jest/Mocha
- **Keine neuen Libraries** ohne Rückfrage. `express-validator` steht in `package.json`, wird aber nicht benutzt: Validierung wird von Hand geschrieben (siehe §5).
- Konfiguration über `process.env` (dotenv). Neue Variablen in `.env.example` eintragen, nie in `.env` committen.

## 2. Ordnerstruktur

```
app.js                  Express-Setup, CORS, Helmet, Mounting aller Router, Scheduler-Start
routes/                 Ein Router pro Ressource; Unterordner nach Bereich (crm/, website/, auth/, general/, assistant/, feedback/)
controllers/            Ein Controller pro Ressource, gleiche Unterordner wie routes/
models/                 Sequelize-Models, werden in models/index.js automatisch geladen
migrations/             sequelize-cli Migrations
services/               Geteilte Logik und Integrationen (Mail, Upload, Logging, Geocoder), Unterordner pro Thema
utils/                  Kleine, reine Hilfsfunktionen (Preislogik, Token-Normalisierung, Input-Checks)
middleware/             Auth, Rollen, Sanitizer, Rate-Limits
test/<thema>/           Tests, ein Ordner pro Feature
```

Es gibt **keine Service-Schicht für CRUD**. Datenbankzugriffe und Geschäftslogik stehen direkt im Controller. Nur wenn Logik von mehreren Controllern gebraucht wird (z. B. Preisberechnung in Cart und Contract), wandert sie nach `utils/` oder `services/`.

## 3. Benennung

| Was | Konvention | Beispiel |
|---|---|---|
| Controller-Datei | camelCase + `Controller.js` | `carAboFolderController.js` |
| Route-Datei | camelCase + `Route.js` | `carAboFolderRoute.js` |
| Model-Datei | alles klein, ohne Trenner | `carabofolder.js` |
| Model-Name | PascalCase, Singular | `CarAboFolder` |
| Tabellenname | PascalCase, Plural | `CarAboFolders` |
| Spalten | camelCase | `sortOrder`, `carAboId` |
| URL-Pfad | kebab-case, Plural | `/api/car-abo-folders` |
| Handler | Verb + Ressource | `getFolders`, `createFolder`, `findAllCarAbos`, `updateCarAbo` |
| Konstanten | UPPER_SNAKE_CASE oben in der Datei | `MAX_NAME_LENGTH`, `DEPOSIT_STEP` |
| Interne Fehlercodes | UPPER_SNAKE_CASE-String | `"CART_NOT_FOUND"` |

Ausnahme: Die Module **feedback** und **followup** nutzen snake_case-Spalten (`send_at`, `body_html`). Wenn du diese Module erweiterst, bleib bei snake_case. Alles andere ist camelCase.

## 4. Routen

Jede Route-Datei folgt diesem Aufbau:

```js
const express = require("express");
const router = express.Router();
const {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} = require("../controllers/carAboFolderController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

// Kurzer Kommentar, warum die Rechte so sind.
const staff = [authenticateToken, requireRole("ADMIN", "SELLER")];

router.get("/", ...staff, getFolders);
router.post("/", ...staff, createFolder);
router.patch("/:id(\\d+)", ...staff, updateFolder);
router.delete("/:id(\\d+)", ...staff, deleteFolder);

module.exports = router;
```

Regeln:
- Controller-Funktionen per Destructuring importieren. `const controller = require(...)` + `controller.fn` gibt es auch, ist bei großen Controllern (Contract, Cart) okay.
- **Mounting in `app.js`** unter `/api/<ressource>`, Import oben bei den anderen Routen-Imports.
- Spezifische Pfade (`/admin`, `/available`, `/assignments`) **vor** `/:id` registrieren.
- Numerische IDs im Pfad einschränken: `/:id(\\d+)` oder `router.param("id", ...)` mit 400 bei Nicht-Ziffern.
- HTTP-Verben: `GET` lesen, `POST` anlegen und Aktionen (`/:id/calculate-price`, `/:id/sign-link`), `PATCH` Teil-Update, `PUT` für Ersetzen einer Zuordnung/Regel, `DELETE` löschen.

### Auth und Rollen

- Rollen: `ADMIN` und `SELLER` sind CRM-Mitarbeitende. Kunden haben **keinen Login**; sie identifizieren sich über Tokens (Cart-`accessToken`, Sign-Token, Share-Key).
- CRM-Endpunkte: `authenticateToken, requireRole("ADMIN", "SELLER")` oder `...requireStaff` aus `middleware/requireStaff.js`.
- Nur Admin (Settings ändern, User anlegen, Follow-up): `authenticateToken, requireRole("ADMIN")`.
- Öffentliche Endpunkte (Website, Checkout) bekommen **keine** Auth, dafür einen Rate-Limiter.
- Neue Routen nutzen `requireRole`, nicht `authorizeRoles` (ältere Alias-Variante).
- Auth am ganzen Router in `app.js` nur, wenn wirklich alle Routen geschützt sind (`/api/crm/*`, `/api/users`).

### Rate-Limits

Öffentliche Schreib- oder teure Endpunkte bekommen einen eigenen Limiter, **inline in der Route-Datei** definiert:

```js
const rateLimit = require("express-rate-limit");

const calculatePriceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many price calculation requests from this IP, please try again later",
});

router.post("/:id/calculate-price", calculatePriceLimiter, calculatePrice);
```

Fenster ist fast immer 15 Minuten. Auth-Limits (IP + E-Mail) liegen gesammelt in `middleware/authRateLimits.js`.

## 5. Controller

### Grundform

```js
const db = require("../models");
const { logger } = require("../services/logging");

const MAX_NAME_LENGTH = 80;

// Hilfsfunktionen als const-Arrow-Functions oben in der Datei
const normalizeName = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const validateName = (value) => {
  const name = normalizeName(value);
  if (!name) return { error: "Bitte gib einen Ordnernamen ein." };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Der Ordnername darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.` };
  }
  return { name };
};

exports.createFolder = async (req, res) => {
  const { name, error } = validateName(req.body?.name);
  if (error) return res.status(400).json({ error });

  try {
    const folder = await db.CarAboFolder.create({ name });
    return res.status(201).json(folder);
  } catch (err) {
    logger("error", `[createCarAboFolder] ${err.message}`);
    return res.status(500).json({ error: "Es ist ein Fehler aufgetreten" });
  }
};

// Nur für Tests exportiert
exports._internals = { validateName };
```

Regeln:
- Handler sind `exports.name = async (req, res) => { ... }`. Kein `next(err)`, kein zentraler Error-Handler, keine Klassen.
- `db` wird als Ganzes importiert, Models über `db.ModelName` angesprochen.
- Jeder Handler hat **sein eigenes `try/catch`** und gibt in jedem Zweig `return res.status(...)...` zurück.
- **Validierung vor dem `try`**, als Hilfsfunktion, die `{ wert }` oder `{ error }` zurückgibt. Mehrere Fehler sammeln (`{ errors: [], data }`) ist bei großen Payloads okay (siehe `validateRulePayload` in followupController).
- Hilfsfunktionen, die getestet werden sollen, am Dateiende unter `exports._internals` exportieren.
- Konstanten (Limits, Schritte, Faktoren) als UPPER_SNAKE_CASE oben in der Datei.

### Eingaben behandeln

`requestSanitizer` trimmt bereits global alle Strings, entfernt `<`, `>`, `javascript:` und Prototype-Keys. Trotzdem gilt:
- **Typ immer prüfen**, bevor ein Wert in ein `where` geht. Arrays oder Objekte würden in Sequelize zu `IN (...)` oder Operatoren. Beispiel: `typeof value === "string" && /^\d{6}$/.test(value)`.
- IDs mit einer `parsePositiveInt`-Hilfsfunktion parsen, die `null` bei Müll liefert.
- **Whitelist statt `req.body` durchreichen:** erlaubte Felder in einer Konstante (`SETTING_PATCHABLE_FIELDS`) und nur diese übernehmen, oder Felder einzeln auslesen.
- Bei PATCH nur Felder übernehmen, die im Body vorhanden sind (`"name" in req.body` oder `Object.prototype.hasOwnProperty.call(req.body, key)`). Leeres Update gibt 400 `"Keine Änderungen übermittelt."`.
- Zahlen aus dem CRM können als `"29,50"` kommen: Komma zu Punkt ersetzen, dann `Number.parseFloat`. Leerstring wird `null`.
- Booleans aus Strings über eine kleine Hilfsfunktion (`"true"`/`"false"`) mit Fallback.
- Batches begrenzen (`MAX_MOVE_BATCH = 500`) und Duplikate entfernen.
- Enum-Werte gegen ein `new Set([...])` prüfen.

### Antworten

| Fall | Status | Body |
|---|---|---|
| Lesen erfolgreich | 200 | Das Objekt oder Array **direkt**, ohne Wrapper |
| Angelegt | 201 | Das angelegte Objekt |
| Gelöscht | 204 | `res.status(204).send()` |
| Aktion ohne Entität | 200 | Kleines Objekt mit dem Ergebnis, z. B. `{ carAboIds, folderId }` |
| Liste mit Pagination | 200 | `{ <ressourcen>: rows, pagination: { page, limit, total, totalPages } }` |
| Ungültige Eingabe | 400 | `{ error: "Deutsche Meldung." }` |
| Nicht angemeldet | 401 | `{ message: "Unauthorized" }` (macht die Middleware) |
| Keine Rechte | 403 | `{ message: "Access denied" }` (macht die Middleware) |
| Nicht gefunden | 404 | `{ error: "Ordner nicht gefunden." }` |
| Konflikt / schon erledigt | 409 | `{ error: "..." }` |
| Serverfehler | 500 | `{ error: "Es ist ein Fehler aufgetreten" }` |

- Fehler-Key in neuem Code ist **`error`**. Ältere Controller nutzen `message`; wenn du einen bestehenden Controller erweiterst, nimm den Key, den der Controller schon benutzt (Cart und Contract: `message`), damit das Frontend nicht bricht.
- Fehlermeldungen an den Nutzer sind **Deutsch**, ganze Sätze mit Punkt, du-Form im Kunden-Checkout ("Bitte wähle..."). Rate-Limit-Meldungen und Middleware-Meldungen sind Englisch.
- Die 500-Antwort enthält **nie** `error.message` oder Stacktraces.
- Öffentliche Antworten dürfen keine internen Felder enthalten: `attributes: { exclude: ["internalId"] }` oder vor dem Senden löschen (`publicCartJson` entfernt `id`, `userId`). CRM-Daten (z. B. Ordner) bekommen eigene Tabellen, damit sie nie in öffentlichen Includes landen.

### Fehler im Ablauf: String-Codes

Für fachliche Fehler tief in einer Transaktion oder Hilfsfunktion wird ein Error mit Code geworfen und im `catch` auf eine Antwort gemappt:

```js
// in der Logik
if (!cart) throw new Error("CART_NOT_FOUND");
if (cart.completed) throw new Error("CART_ALREADY_COMPLETED");

// im catch des Handlers
if (error.message === "CART_NOT_FOUND") {
  return res.status(400).json({ message: "Warenkorb nicht gefunden. Bitte starte die Buchung erneut." });
}
if (error.message === "CART_ALREADY_COMPLETED") {
  return res.status(409).json({ message: "Diese Buchung wurde bereits abgeschlossen." });
}
return res.status(500).json({ message: "Es ist ein Fehler aufgetreten" });
```

- Keine eigenen Error-Klassen. Eine `if`-Kette pro Code ist der übliche Stil.
- Wiederverwendete Codes bekommen eine Map mit Meldungen im `utils/`-Modul (`COLOR_ERROR_MESSAGES`), geprüft mit `if (COLOR_ERROR_MESSAGES[error.message])`.
- Bei kleinen Transaktionen alternativ ein Ergebnisobjekt zurückgeben: `return { status: 404, error: "..." }` und nach der Transaktion auswerten (siehe `moveCarAbos`).

### Transaktionen

Immer die Callback-Form (managed transaction), `transaction` an **jeden** Aufruf darin weitergeben:

```js
const deleted = await db.sequelize.transaction(async (transaction) => {
  const folder = await db.CarAboFolder.findByPk(req.params.id, { transaction });
  if (!folder) return false;
  await db.CarAboFolderAssignment.destroy({ where: { folderId: folder.id }, transaction });
  await folder.destroy({ transaction });
  return true;
});
```

Transaktion nutzen, sobald mehr als eine Tabelle geschrieben wird (Eltern + Kinder, Zuordnungen ersetzen).

### Sequelize-Abfragen

- `findByPk`, `findAll`, `findOne({ where })`, `findAndCountAll` für Listen mit Pagination, `bulkCreate` für Kinder.
- Lange `include`-Arrays, die mehrfach gebraucht werden, als Konstante oben im Controller (`carAboIncludes` öffentlich, `carAboAdminIncludes` für das CRM).
- Immer mit `as`-Alias inkludieren, Reihenfolge über `order`, bei Kind-Listen mit eigener Sortierung `separate: true`.
- `attributes` explizit setzen, wenn User- oder Personendaten mitgeladen werden.
- Unabhängige Abfragen parallel mit `Promise.all`.
- Kind-Listen beim Update: bestehende per `id` aktualisieren, neue anlegen, übrige löschen (`updateChildren`-Muster).
- Pagination: `page` und `limit` aus Query mit `parsePositiveInt(value, fallback, max)`, Default `limit` 25, Max 100, `offset = (page - 1) * limit`.
- Suche: `Op.like` mit `%${search}%`, `Op` über `db.Sequelize.Op`.

## 6. Logging und Audit

- Fehler im Controller: `logger("error", \`[handlerName] ${error.message}\`)` aus `services/logging.js`. Achtung: `logger("error")` verschickt **eine Fehler-Mail**. Für erwartbare Fälle `"warn"` oder `"info"` nehmen.
- Erlaubte Log-Typen: `geoCoder`, `debug`, `error`, `info`, `warn`. Andere werfen.
- Sicherheitsrelevante Ereignisse (Token nicht gefunden, Login, Vertragsabschluss fehlgeschlagen) zusätzlich mit `logSecurityEvent({ req, action, outcome, accessToken, extra })` aus `services/audit/securityAudit.js`. `action` und `outcome` sind snake_case-Strings.
- `console.error` taucht in älterem Code auf; neuer Code nutzt `logger`.

## 7. Models

```js
"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  // Kurzer Kommentar zu Besonderheiten (z. B. Schlüssel, Eindeutigkeit).
  class CarAboFolder extends Model {
    static associate(models) {
      CarAboFolder.hasMany(models.CarAboFolderAssignment, {
        foreignKey: "folderId",
        as: "assignments",
        onDelete: "CASCADE",
      });
    }
  }

  CarAboFolder.init(
    {
      name: { type: DataTypes.STRING(80), allowNull: false },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: "CarAboFolder",
      tableName: "CarAboFolders",
      timestamps: true,
    }
  );

  return CarAboFolder;
};
```

- Eine Datei pro Model in `models/`; `index.js` lädt sie automatisch. Nichts in `index.js` eintragen.
- `id` nicht definieren (Auto-Increment kommt von der Migration), außer bei reinen Zuordnungstabellen mit eigenem Primärschlüssel.
- Personenbezogene Daten (Adresse, Name, Geburtsdatum usw.) werden über `set`/`get` mit `encrypt`/`decrypt` aus `services/encryption.js` verschlüsselt gespeichert (siehe `contract.js`, `customerdetails.js`). Spalte dafür als `TEXT` anlegen.
- Geldbeträge als `DECIMAL(10, 2)`.
- Flexible Texte, die auch Zahlen sein können (WLTP-Werte), als String speichern, nicht parsen.

## 8. Migrations

- Dateiname: `YYYYMMDDHHMMSS-beschreibung-in-kebab-case.js`, z. B. `20261027100000-create-car-abo-folders.js`. Zeitstempel nach der letzten bestehenden Migration wählen.
- Immer `up` **und** `down`. `down` macht `up` vollständig rückgängig, in umgekehrter Reihenfolge.
- Neue Tabellen mit `id`, `createdAt`, `updatedAt` (alle `allowNull: false`) und Fremdschlüsseln mit `references`, `onUpdate: "CASCADE"`, `onDelete: "CASCADE"` oder `"SET NULL"`.
- Index auf Fremdschlüssel-Spalten mit `queryInterface.addIndex`.
- Neue Spalten an bestehenden Tabellen: `nullable` oder mit `defaultValue`, damit bestehende Zeilen gültig bleiben.
- Ein kurzer deutscher Kommentar über jeder Änderung, der das **Warum** erklärt.
- Model und Migration immer zusammen ändern.

## 9. Tests

- Pfad: `test/<feature>/<datei>.test.js`, ausführen mit `npm test`.
- `require("../helpers/stubSideEffects")` **als erstes**, damit Logger und Security-Audit gestubbt sind, bevor der Controller geladen wird.
- Controller direkt aufrufen mit Fake-`req`-Objekt und `createMockRes()`; danach `res.statusCode` und `res.body` prüfen.
- Model-Methoden mit `patch(db.Model, { findAll: async () => [...] })` ersetzen und mit `t.after(...)` zurücksetzen. Transaktionen mit `patch(db.sequelize, { transaction: async (fn) => fn({ id: "tx" }) })`.
- Keine echte Datenbank in Tests.
- Validierungsfunktionen über `_internals` testen, auch mit Angriffs-Eingaben (`[{ $gt: 0 }]`, `"1; DROP TABLE"`, Arrays statt Strings).
- Testnamen auf Englisch, Abschnitts-Kommentare auf Deutsch (`// ─── Validierung ───`).

## 10. Code-Stil

- 2 Leerzeichen, doppelte Anführungszeichen, Semikolons, Trailing Commas in mehrzeiligen Listen (Prettier-Defaults).
- `const` vor `let`; `let` nur, wenn neu zugewiesen wird.
- Optional Chaining und Nullish Coalescing sind üblich (`req.body?.name`, `geo?.lon ?? geo?.lng`).
- `Number.parseInt(value, 10)`, `Number.isFinite`, `Number.isInteger` statt der globalen Varianten.
- Neue Utils und Services beginnen mit `"use strict";`.
- **Kommentare auf Deutsch**, kurz, und nur dort, wo das Warum nicht offensichtlich ist: Sicherheitsgründe, fachliche Regeln, Rückwärtskompatibilität. JSDoc-Einzeiler (`/** ... */`) über Hilfsfunktionen mit nicht-trivialer Logik.
- Keine Emojis in neuem Code.
- Umlaute in Strings sind okay und erwünscht ("Ungültige", nicht "Ungueltige").

## 11. Sicherheit (nicht verhandelbar)

- Jede Route bewusst einordnen: öffentlich (mit Rate-Limit) oder Staff (mit `authenticateToken` + `requireRole`). Im Zweifel Staff.
- Keine Nutzereingaben ungeprüft in Dateipfade; Upload-Dateinamen selbst erzeugen (Zeitstempel/UUID), Endung über Whitelist.
- Uploads über `services/upload.js` (`uploadFile`, `uploadFiles`), Größen- und Typ-Limits nicht aufweichen.
- Tokens im Pfad vor der Abfrage normalisieren und gegen ein Regex prüfen (`normalizeCartAccessToken`).
- Keine Secrets oder personenbezogenen Daten in Logs; Tokens nur gehasht (`hashCartAccessTokenForLog`).
- HTML ist nur in den Feldern `description` und `body_html` erlaubt (`HTML_ALLOWED_KEYS` im Sanitizer). Neue HTML-Felder dort eintragen und beim Ausgeben `sanitize-html` nutzen.

## 12. Checkliste für ein neues Feature

1. Migration anlegen (`up` + `down`, deutscher Kommentar)
2. Model in `models/` anlegen, Assoziationen in `associate`
3. Controller mit Validierungs-Hilfsfunktionen, `try/catch` pro Handler, `logger` im catch, `_internals`
4. Route-Datei mit Auth/Rollen bzw. Rate-Limit, spezifische Pfade vor `/:id`
5. Router in `app.js` importieren und unter `/api/<ressource>` mounten
6. Test in `test/<feature>/` mit `stubSideEffects`, `createMockRes`, `patch`
7. Neue env-Variablen in `.env.example`
