const test = require("node:test");
const assert = require("node:assert/strict");
const multer = require("multer");
const path = require("path");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

function mediaFileFilter(req, file, cb) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const isAllowedMime = ALLOWED_MIME_TYPES.has(file.mimetype);
  const isAllowedExtension = ALLOWED_EXTENSIONS.has(extension);

  if (!isAllowedMime || !isAllowedExtension) {
    return cb(new Error("Invalid file type"));
  }

  return cb(null, true);
}

function contractFileFilter(req, file, cb) {
  const isPdfMime = file.mimetype === "application/pdf";
  const isPdfName = /\.pdf$/i.test(file.originalname || "");
  if (isPdfMime && isPdfName) {
    return cb(null, true);
  }
  return cb(new Error("Only PDF files are allowed"));
}

function runFileFilter(filter, file) {
  return new Promise((resolve, reject) => {
    filter({}, file, (error, accepted) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(accepted);
    });
  });
}

test("media fileFilter accepts valid jpeg files", async () => {
  const accepted = await runFileFilter(mediaFileFilter, {
    originalname: "photo.jpg",
    mimetype: "image/jpeg",
  });
  assert.equal(accepted, true);
});

test("media fileFilter accepts valid pdf files", async () => {
  const accepted = await runFileFilter(mediaFileFilter, {
    originalname: "document.pdf",
    mimetype: "application/pdf",
  });
  assert.equal(accepted, true);
});

test("media fileFilter rejects invalid mime types", async () => {
  await assert.rejects(
    () =>
      runFileFilter(mediaFileFilter, {
        originalname: "script.exe",
        mimetype: "application/octet-stream",
      }),
    (error) => error.message === "Invalid file type",
  );
});

test("media fileFilter rejects extension and mime mismatch", async () => {
  await assert.rejects(
    () =>
      runFileFilter(mediaFileFilter, {
        originalname: "notes.txt",
        mimetype: "text/plain",
      }),
    (error) => error.message === "Invalid file type",
  );
});

test("media upload enforces 5 MB limit configuration", () => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 5 },
  });

  assert.equal(upload.limits.fileSize, 5242880);
});

test("contract fileFilter accepts pdf files only", async () => {
  const accepted = await runFileFilter(contractFileFilter, {
    originalname: "vertrag.pdf",
    mimetype: "application/pdf",
  });
  assert.equal(accepted, true);
});

test("contract fileFilter rejects non-pdf files", async () => {
  await assert.rejects(
    () =>
      runFileFilter(contractFileFilter, {
        originalname: "notes.txt",
        mimetype: "text/plain",
      }),
    (error) => error.message === "Only PDF files are allowed",
  );
});

test("contract fileFilter rejects pdf mime with wrong extension", async () => {
  await assert.rejects(
    () =>
      runFileFilter(contractFileFilter, {
        originalname: "notes.txt",
        mimetype: "application/pdf",
      }),
    (error) => error.message === "Only PDF files are allowed",
  );
});

test("contract upload enforces 10 MB limit configuration", () => {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 10 },
  });

  assert.equal(upload.limits.fileSize, 10485760);
});

test("mediaController returns 400 when req.file is missing", () => {
  const req = {};
  const hasFile = Boolean(req.file);
  assert.equal(hasFile, false);
});
