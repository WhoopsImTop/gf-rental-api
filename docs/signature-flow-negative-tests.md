# Signature Flow Negative Tests

Diese Checks validieren, dass der Signatur-Flow bei Fehlern kontrolliert reagiert (kein Prozessabsturz, keine ungefangenen Runtime-Fehler).

## API-Negativfaelle

1. Ungueltig URL-encodierter Token
   - Request: `GET /api/contracts/sign/public/%E0%A4%A`
   - Erwartung: `404` oder `410`, JSON-Fehlermeldung, kein 500/Crash.

2. Fehlende `contract.User.email` beim Sign-Link
   - Request: `POST /api/contracts/:id/sign-link`
   - Setup: Contract ohne valide User-E-Mail
   - Erwartung: `422`, message `Kunden-E-Mail fehlt...`, kein TypeError.

3. Signatur ohne Daten
   - Request: `POST /api/contracts/sign/public/:token`
   - Body: `{ "fullName": "Max Mustermann", "acceptTerms": true, "acceptPrivacy": true }`
   - Erwartung: `400`, message `Signatur fehlt.`

4. Signatur mit falschem Datenformat
   - Body: `signatureDataUrl: "data:text/plain;base64,abc"`
   - Erwartung: `400`, message `Signaturformat ungueltig.`

5. Signatur zu gross
   - Body: PNG Base64 > 2MB
   - Erwartung: `400`, message `Signatur ist leer oder zu gross.`

6. Abgelaufener oder bereits benutzter Token
   - Request: `POST /api/contracts/sign/public/:token`
   - Erwartung: `410`, kontrollierte Fehlermeldung.

## Frontend-Negativfaelle

1. Fehlender Route-Token
   - URL: `/sign/` oder fehlerhafte Route
   - Erwartung: sichtbare Fehlermeldung `Der Signaturlink ist ungueltig.`, kein JS-Abbruch.

2. Canvas kann nicht initialisiert werden
   - Simulierbar durch Browser-/Canvas-Einschraenkung
   - Erwartung: Fehlermeldung `Signaturfeld konnte nicht initialisiert werden...`, Seite bleibt bedienbar.

3. Vorschau-Reload mit ungueltiger URL
   - Zustand mit defekter `previewUrl`
   - Erwartung: Fehlermeldung `Die Vertragsvorschau konnte nicht neu geladen werden.`, kein uncaught exception.

4. Submit ohne bereitgestelltes Canvas
   - Erwartung: Fehlermeldung `Signaturfeld ist nicht bereit...`, kein Runtime-Fehler.
