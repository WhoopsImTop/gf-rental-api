const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY = Buffer.from(process.env.ENCRYPTION_KEY, "hex");

if (KEY.length !== 32) {
  throw new Error("ENCRYPTION_KEY must be 32 bytes (hex encoded)");
}

function encrypt(value) {
  if (value == null) return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString(
    "hex"
  )}`;
}

function decrypt(payload) {
  if (!payload) return null;

  const [version, ivHex, tagHex, dataHex] = payload.split(":");
  if (version !== "v1") throw new Error("Unsupported encryption version");

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(ivHex, "hex")
  );

  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith("v1:");
}

function createHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = { encrypt, decrypt, isEncrypted, createHash };
