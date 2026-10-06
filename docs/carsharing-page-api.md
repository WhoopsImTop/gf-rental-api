# Carsharing-Fahrzeugseiten – API für das WordPress-Plugin

Basis: `https://<api-host>/api/carsharing-cars`

Alle hier beschriebenen Endpunkte sind öffentlich (kein Login nötig) und liefern `Cache-Control: public, max-age=300`.
Die WordPress-Seite lädt die Daten per JavaScript (`fetch`) direkt im Browser und rendert sie.
**CORS:** Die API erlaubt Browser-Requests nur von `https://gruene-flotte.com` und dessen Subdomains (`app.js`).
Läuft WordPress unter einer anderen Domain, muss diese dort ergänzt werden.

## Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/` | Alle sichtbaren Fahrzeuge (`status` = `active` oder `coming_soon`) |
| GET | `/?status=coming_soon` | Nur „Coming Soon“-Fahrzeuge (`active` funktioniert analog) |
| GET | `/:id` | Ein Fahrzeug per ID inkl. Seiteninhalt (404, wenn `hidden`) |

`pageBlocks` ist in beiden Antworten enthalten. Ist die Seite im CRM deaktiviert (`pageEnabled = false`), ist `pageBlocks` eine leere Liste.

## Fahrzeug-Felder

| Feld | Typ | Hinweis |
|---|---|---|
| `id` | number | |
| `name` | string | Hersteller |
| `subline` | string | Modell |
| `shortDescription` | string | |
| `description` | string (HTML) | |
| `size`, `fuel`, `gear` | string | |
| `price` | number | |
| `status` | `"active" \| "coming_soon"` | `hidden` wird nie ausgeliefert |
| `availableFrom` | `"YYYY-MM-DD"` \| null | nur sinnvoll bei `coming_soon` |
| `comingSoonText` | string \| null | z. B. „Ab Frühjahr in Freiburg“ |
| `pageEnabled` | boolean | |
| `pageBlocks` | Block[] | geordnet, siehe unten; leer, wenn `pageEnabled = false` |
| `images` | Media[] | sortiert nach `order` (Galerie-Reihenfolge aus dem CRM) |

`technicalData` und `weightAndPayload` sind aus historischen Gründen JSON-**Strings** im Format `{"columns": [...], "rows": [[...]]}` und müssen mit `JSON.parse` gelesen werden (ggf. zweimal, falls das Ergebnis wieder ein String ist).

## Block-Typen (`pageBlocks`)

Jeder Block hat `id` (string, stabil) und `type`. Unbekannte Typen sollte das Plugin ignorieren (zukünftige Erweiterungen).

```jsonc
{ "id": "…", "type": "text", "body_html": "<h2>Titel</h2><p>Text …</p>" }

{ "id": "…", "type": "accordion",
  "items": [{ "title": "Wie buche ich?", "body_html": "<p>…</p>" }] }

{ "id": "…", "type": "links",
  "items": [{ "label": "Tarife", "url": "https://…", "newTab": true }] }

{ "id": "…", "type": "button",
  "label": "Jetzt buchen", "url": "https://…", "style": "primary", "newTab": false }   // style: primary | secondary

{ "id": "…", "type": "image",
  "mediaId": 12, "url": "https://…/uploads/foto.webp", "alt": "Frontansicht", "caption": "" }

{ "id": "…", "type": "video",
  "provider": "youtube", "videoId": "dQw4w9WgXcQ",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "" }                  // provider: youtube | vimeo
```

`body_html` ist serverseitig auf `p, h2, h3, strong, b, em, i, s, u, ul, ol, li, a, br, blockquote` gefiltert und darf per `innerHTML` eingesetzt werden. Links mit `target="_blank"` haben bereits `rel="noopener noreferrer"`.
**Alle anderen Felder** (`title`, `label`, `alt`, `caption`, `comingSoonText`, …) sind Klartext und müssen per `textContent` bzw. `setAttribute` gesetzt werden – nie per `innerHTML`.

## Rendering-Empfehlungen

- **Coming Soon:** Bei `status = "coming_soon"` einen Badge „Coming Soon“ anzeigen, darunter `comingSoonText` und, falls gesetzt, „Verfügbar ab {availableFrom}“ (deutsches Datumsformat). Buchungs-Buttons können je nach Design ausgeblendet werden.
- **Akkordeon:** `<details><summary>{title}</summary>{body_html}</details>` funktioniert ohne JavaScript.
- **Video:** iframe aus `provider` + `videoId` bauen, nicht aus `url`:
  - YouTube: `https://www.youtube-nocookie.com/embed/{videoId}`
  - Vimeo: `https://player.vimeo.com/video/{videoId}?dnt=1`
  - Wegen DSGVO idealerweise erst nach Klick laden (Vorschaubild + Hinweis).
- **Bild:** `alt` immer setzen; `caption` optional als `<figcaption>`.

## Beispiel

```js
const res = await fetch("https://<api-host>/api/carsharing-cars/7");
const car = await res.json();
```

```json
{
  "id": 7,
  "name": "VW",
  "subline": "ID.3",
  "status": "coming_soon",
  "availableFrom": "2027-03-01",
  "comingSoonText": "Bald an der Station Hauptbahnhof",
  "pageEnabled": true,
  "images": [{ "id": 31, "url": "https://…/uploads/id3.webp", "order": 0 }],
  "pageBlocks": [
    { "id": "4f1c…", "type": "text", "body_html": "<h2>Der ID.3</h2><p>…</p>" },
    { "id": "9a2e…", "type": "video", "provider": "youtube", "videoId": "dQw4w9WgXcQ", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "" },
    { "id": "c03b…", "type": "button", "label": "Benachrichtigen", "url": "https://gruene-flotte.com/newsletter", "style": "primary", "newTab": false }
  ]
}
```
