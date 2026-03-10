/**
 * TOTP (Time-based One-Time Password) service
 * RFC 6238 compliant implementation using Node.js built-in crypto.
 * Compatible with Google Authenticator, Authy, and other TOTP apps.
 */
const crypto = require("node:crypto");

// ── Base32 helpers (RFC 4648) ────────────────────────────────────
const B32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0, value = 0, output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(str) {
  str = str.replace(/=+$/, "").toUpperCase();
  let bits = 0, value = 0, index = 0;
  const output = Buffer.alloc(Math.floor((str.length * 5) / 8));
  for (const char of str) {
    value = (value << 5) | B32_CHARS.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return output.slice(0, index);
}

// ── TOTP core ────────────────────────────────────────────────────

/**
 * Generate a random base32-encoded secret (20 bytes = 32 chars).
 */
function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

/**
 * Generate a TOTP code for a given secret and time window offset.
 * @param {string} secret - Base32-encoded secret
 * @param {number} windowOffset - Time window offset (0 = current, -1 = previous, etc.)
 * @returns {string} 6-digit TOTP code
 */
function generateCode(secret, windowOffset = 0) {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / 30) + windowOffset;

  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  buf.writeUInt32BE(time >>> 0, 4);

  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;

  return code.toString().padStart(6, "0");
}

/**
 * Verify a TOTP code against a secret.
 * Allows a ±1 time window to account for clock drift.
 * @param {string} token - 6-digit code from the user
 * @param {string} secret - Base32-encoded secret
 * @param {number} window - Number of time steps to check in each direction (default: 1)
 * @returns {boolean}
 */
function verifyCode(token, secret, window = 1) {
  if (!token || !secret || token.length !== 6) return false;
  for (let i = -window; i <= window; i++) {
    if (generateCode(secret, i) === token) return true;
  }
  return false;
}

/**
 * Generate an otpauth:// URI for QR code generation.
 * @param {string} account - User identifier (email or username)
 * @param {string} issuer - App/service name
 * @param {string} secret - Base32-encoded secret
 * @returns {string} otpauth:// URI
 */
function generateURI(account, issuer, secret) {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(account);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, generateCode, verifyCode, generateURI };
