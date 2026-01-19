const crypto = require("crypto");
const ENCRYPTION_KEY = process.env.OLD_ENCRYPTION_KEY; // Muss 32 Bytes sein
const IV_LENGTH = 16;

if (ENCRYPTION_KEY.length !== 32) {
  throw new Error("Encryption key must be exactly 32 bytes long.");
}

function old_encrypt(value) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

function old_decrypt(value) {
  const [ivHex, encryptedData] = value.split(":");
  if (!ivHex || !encryptedData) throw new Error("Invalid data format");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function old_isEncrypted(value) {
  return typeof value === "string" && value.includes(":");
}

function old_createHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = { old_encrypt, old_decrypt, old_isEncrypted, old_createHash };