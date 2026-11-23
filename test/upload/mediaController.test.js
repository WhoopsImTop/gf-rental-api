const { createMockRes, patch } = require("../helpers/stubSideEffects");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

const db = require("../../models");
const mediaController = require("../../controllers/mediaController");
const imageVariants = require("../../services/imageVariants");

const { parseIdList, parseListQuery } = mediaController._internals;
const { Op } = db.Sequelize;

// ─── Query-Parsing ───

test("parseListQuery keeps legacy full list without page, limit or ids", () => {
  const query = parseListQuery({});
  assert.equal(query.mode, "all");
  assert.deepEqual(query.where, {});
});

test("parseListQuery paginates with defaults and caps limit", () => {
  assert.deepEqual(
    (({ mode, page, limit, offset }) => ({ mode, page, limit, offset }))(
      parseListQuery({ page: "3", limit: "500" }),
    ),
    { mode: "page", page: 3, limit: 100, offset: 200 },
  );
  const fallback = parseListQuery({ page: "abc" });
  assert.equal(fallback.page, 1);
  assert.equal(fallback.limit, 48);
  assert.equal(fallback.offset, 0);
});

test("parseListQuery only accepts whitelisted type filters", () => {
  assert.deepEqual(parseListQuery({ type: "image", page: "1" }).where.fileType, {
    [Op.like]: "image/%",
  });
  assert.equal(parseListQuery({ type: "text/%", page: "1" }).where.fileType, undefined);
  assert.equal(parseListQuery({ type: ["image"], page: "1" }).where.fileType, undefined);
});

test("parseListQuery escapes LIKE wildcards in search and ignores non-strings", () => {
  assert.deepEqual(parseListQuery({ search: "50%_rabatt", page: "1" }).where.name, {
    [Op.like]: "%50\\%\\_rabatt%",
  });
  assert.equal(parseListQuery({ search: { $gt: "" }, page: "1" }).where.name, undefined);
});

test("parseIdList drops garbage, duplicates and non-string input", () => {
  assert.deepEqual(parseIdList("3,1,3,abc,0,-2, 7 ,1; DROP TABLE"), [3, 1, 7]);
  assert.deepEqual(parseIdList(["1", "2"]), []);
  assert.deepEqual(parseIdList({ $gt: 0 }), []);
  assert.equal(parseIdList(Array.from({ length: 150 }, (_, i) => i + 1).join(",")).length, 100);
});

// ─── getAllMedia ───

test("getAllMedia returns paginated payload", async (t) => {
  let captured;
  t.after(
    patch(db.Media, {
      findAndCountAll: async (options) => {
        captured = options;
        return { rows: [{ id: 9 }], count: 97 };
      },
    }),
  );

  const res = createMockRes();
  await mediaController.getAllMedia({ query: { page: "2", limit: "48", type: "image" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    media: [{ id: 9 }],
    pagination: { page: 2, limit: 48, total: 97, totalPages: 3 },
  });
  assert.equal(captured.offset, 48);
  assert.ok(captured.attributes.includes("thumbnailUrl"));
});

test("getAllMedia without params still returns a plain array", async (t) => {
  t.after(patch(db.Media, { findAll: async () => [{ id: 1 }, { id: 2 }] }));
  const res = createMockRes();
  await mediaController.getAllMedia({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ id: 1 }, { id: 2 }]);
});

test("getAllMedia with ids looks up only those ids", async (t) => {
  let captured;
  t.after(
    patch(db.Media, {
      findAll: async (options) => {
        captured = options;
        return [{ id: 4 }];
      },
    }),
  );
  const res = createMockRes();
  await mediaController.getAllMedia({ query: { ids: "4,5" } }, res);
  assert.deepEqual(res.body, [{ id: 4 }]);
  assert.deepEqual(captured.where.id, { [Op.in]: [4, 5] });
});

test("getAllMedia with empty ids skips the database", async (t) => {
  t.after(
    patch(db.Media, {
      findAll: async () => {
        throw new Error("should not query");
      },
    }),
  );
  const res = createMockRes();
  await mediaController.getAllMedia({ query: { ids: "abc" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test("getAllMedia hides database errors", async (t) => {
  t.after(
    patch(db.Media, {
      findAndCountAll: async () => {
        throw new Error("connection lost");
      },
    }),
  );
  const res = createMockRes();
  await mediaController.getAllMedia({ query: { page: "1" } }, res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Es ist ein Fehler aufgetreten" });
});

// ─── Thumbnails ───

test("filenameFromMediaUrl extracts the upload filename", () => {
  assert.equal(
    imageVariants.filenameFromMediaUrl("https://api.example.com/public/uploads/123-a.jpg"),
    "123-a.jpg",
  );
  assert.equal(imageVariants.filenameFromMediaUrl("https://x/other/123.jpg"), null);
  assert.equal(imageVariants.filenameFromMediaUrl(null), null);
});

test("createThumbnail skips PDFs and non-raster types", async () => {
  assert.equal(await imageVariants.createThumbnail("a.pdf", "application/pdf"), null);
  assert.equal(await imageVariants.createThumbnail("a.svg", "image/svg+xml"), null);
});

test("createThumbnail writes a small webp next to the upload", async (t) => {
  const filename = `test-thumb-${process.pid}-${Date.now()}.png`;
  const source = path.join(imageVariants.UPLOAD_DIR, filename);
  const target = path.join(imageVariants.THUMB_DIR, imageVariants.thumbnailFilename(filename));
  t.after(async () => {
    await fs.rm(source, { force: true });
    await fs.rm(target, { force: true });
  });

  await fs.mkdir(imageVariants.UPLOAD_DIR, { recursive: true });
  await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "#3a7d44" },
  })
    .png()
    .toFile(source);

  const previousBase = process.env.APPIMAGEURL;
  process.env.APPIMAGEURL = "https://api.example.com/public";
  t.after(() => {
    process.env.APPIMAGEURL = previousBase;
  });

  const url = await imageVariants.createThumbnail(filename, "image/png");
  assert.equal(
    url,
    `https://api.example.com/public/uploads/thumbs/${imageVariants.thumbnailFilename(filename)}`,
  );

  const meta = await sharp(target).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 480);
  assert.equal(meta.height, 240);
});

test("createThumbnail returns null for broken files instead of throwing", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "thumb-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  assert.equal(await imageVariants.createThumbnail("does-not-exist.jpg", "image/jpeg"), null);
});

test("createThumbnail refuses disguised files (SVG/HEIF content with .jpg name)", async (t) => {
  const cases = [
    ["svg", Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    // ISO-BMFF-Header einer HEIC-Datei: ....ftypheic
    ["heic", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(16)])],
  ];
  for (const [label, content] of cases) {
    const filename = `test-disguised-${label}-${process.pid}-${Date.now()}.jpg`;
    const source = path.join(imageVariants.UPLOAD_DIR, filename);
    const target = path.join(imageVariants.THUMB_DIR, imageVariants.thumbnailFilename(filename));
    t.after(async () => {
      await fs.rm(source, { force: true });
      await fs.rm(target, { force: true });
    });
    await fs.writeFile(source, content);

    assert.equal(await imageVariants.createThumbnail(filename, "image/jpeg"), null, label);
    await assert.rejects(fs.access(target), `${label} thumbnail must not exist`);
  }
});

test("sniffRasterFormat detects jpeg, png and webp by content", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sniff-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const base = sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } });
  for (const format of ["jpeg", "png", "webp"]) {
    const file = path.join(tmp, `x.${format}`);
    await base.clone().toFormat(format).toFile(file);
    assert.equal(await imageVariants.sniffRasterFormat(file), format);
  }
});
