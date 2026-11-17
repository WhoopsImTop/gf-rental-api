"use strict";

// Ersetzt Logger und Security-Audit durch Stubs, bevor Controller geladen werden.
// Sonst schreiben Tests in logs/ und logger("error") verschickt eine Fehler-Mail.
function stubModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

const calls = { logger: [], security: [] };

stubModule("../../services/logging", {
  logger: (type, message) => calls.logger.push({ type, message }),
});
stubModule("../../services/audit/securityAudit", {
  logSecurityEvent: (event) => calls.security.push(event),
  clientIp: () => "127.0.0.1",
});

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

/** Ersetzt Methoden für einen Test und gibt eine Funktion zum Zurücksetzen zurück. */
function patch(target, overrides) {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => Object.assign(target, originals);
}

module.exports = { calls, createMockRes, patch };
