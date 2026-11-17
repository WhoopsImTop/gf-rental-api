"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createMockRes, patch } = require("../helpers/stubSideEffects");
const db = require("../../models");
const {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveCarAbos,
  _internals,
} = require("../../controllers/carAboFolderController");

// Transaktion ohne Datenbank: Callback direkt mit einem Platzhalter ausführen.
const mockTransaction = () =>
  patch(db.sequelize, { transaction: async (fn) => fn({ id: "tx" }) });

// ─── Validierung ────────────────────────────────────────────────

test("validateName trims, collapses whitespace and enforces the length", () => {
  assert.deepEqual(_internals.validateName("  Täglich   prüfen "), { name: "Täglich prüfen" });
  assert.ok(_internals.validateName("").error);
  assert.ok(_internals.validateName("   ").error);
  assert.ok(_internals.validateName(["Ordner"]).error);
  assert.ok(_internals.validateName("x".repeat(81)).error);
  assert.deepEqual(_internals.validateName("x".repeat(80)), { name: "x".repeat(80) });
});

test("parseCarAboIds accepts numeric ids, removes duplicates and rejects junk", () => {
  assert.deepEqual(_internals.parseCarAboIds([3, "4", 3]), { ids: [3, 4] });
  assert.ok(_internals.parseCarAboIds([]).error);
  assert.ok(_internals.parseCarAboIds("3").error);
  assert.ok(_internals.parseCarAboIds([0]).error);
  assert.ok(_internals.parseCarAboIds([1.5]).error);
  assert.ok(_internals.parseCarAboIds(["1; DROP TABLE"]).error);
  assert.ok(_internals.parseCarAboIds([{ $gt: 0 }]).error);
  assert.ok(_internals.parseCarAboIds(Array.from({ length: 501 }, (_, i) => i + 1)).error);
});

// ─── Lesen ──────────────────────────────────────────────────────

test("getFolders returns folders and a carAboId → folderId map", async (t) => {
  t.after(
    patch(db.CarAboFolder, {
      findAll: async () => [
        { id: 1, name: "Ernst & König bestellen", sortOrder: 0 },
        { id: 2, name: "Täglich prüfen", sortOrder: 1 },
      ],
    }),
  );
  t.after(
    patch(db.CarAboFolderAssignment, {
      findAll: async () => [
        { carAboId: 37, folderId: 1 },
        { carAboId: 42, folderId: 2 },
      ],
    }),
  );

  const res = createMockRes();
  await getFolders({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.folders.length, 2);
  assert.deepEqual(res.body.assignments, { 37: 1, 42: 2 });
});

// ─── Anlegen / Umbenennen ───────────────────────────────────────

test("createFolder appends the folder at the end", async (t) => {
  let createdWith = null;
  t.after(
    patch(db.CarAboFolder, {
      max: async () => 3,
      create: async (data) => {
        createdWith = data;
        return { id: 9, ...data };
      },
    }),
  );
  const res = createMockRes();
  await createFolder({ body: { name: " Autohaus Weber " } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(createdWith, { name: "Autohaus Weber", sortOrder: 4 });
});

test("createFolder starts at 0 when no folder exists yet", async (t) => {
  let createdWith = null;
  t.after(
    patch(db.CarAboFolder, {
      max: async () => null,
      create: async (data) => {
        createdWith = data;
        return { id: 1, ...data };
      },
    }),
  );
  await createFolder({ body: { name: "Erster" } }, createMockRes());
  assert.equal(createdWith.sortOrder, 0);
});

test("createFolder rejects an empty name without touching the database", async (t) => {
  t.after(
    patch(db.CarAboFolder, {
      create: async () => assert.fail("must not create"),
    }),
  );
  const res = createMockRes();
  await createFolder({ body: { name: "  " } }, res);
  assert.equal(res.statusCode, 400);
});

test("updateFolder renames an existing folder", async (t) => {
  let updatedWith = null;
  t.after(
    patch(db.CarAboFolder, {
      findByPk: async () => ({
        id: 1,
        update: async (data) => {
          updatedWith = data;
        },
      }),
    }),
  );
  const res = createMockRes();
  await updateFolder({ params: { id: "1" }, body: { name: "Neu" } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updatedWith, { name: "Neu" });
});

test("updateFolder returns 404 for an unknown folder and 400 for empty updates", async (t) => {
  t.after(patch(db.CarAboFolder, { findByPk: async () => null }));
  const missing = createMockRes();
  await updateFolder({ params: { id: "5" }, body: { name: "X" } }, missing);
  assert.equal(missing.statusCode, 404);

  const empty = createMockRes();
  await updateFolder({ params: { id: "5" }, body: {} }, empty);
  assert.equal(empty.statusCode, 400);

  const badSort = createMockRes();
  await updateFolder({ params: { id: "5" }, body: { sortOrder: -1 } }, badSort);
  assert.equal(badSort.statusCode, 400);
});

// ─── Löschen ────────────────────────────────────────────────────

test("deleteFolder releases its vehicles and removes the folder", async (t) => {
  t.after(mockTransaction());
  const destroyedAssignments = [];
  let folderDestroyed = false;
  t.after(
    patch(db.CarAboFolder, {
      findByPk: async () => ({
        id: 3,
        destroy: async () => {
          folderDestroyed = true;
        },
      }),
    }),
  );
  t.after(
    patch(db.CarAboFolderAssignment, {
      destroy: async ({ where }) => destroyedAssignments.push(where),
    }),
  );

  const res = createMockRes();
  await deleteFolder({ params: { id: "3" } }, res);
  assert.equal(res.statusCode, 204);
  assert.deepEqual(destroyedAssignments, [{ folderId: 3 }]);
  assert.equal(folderDestroyed, true);
});

test("deleteFolder returns 404 for an unknown folder", async (t) => {
  t.after(mockTransaction());
  t.after(patch(db.CarAboFolder, { findByPk: async () => null }));
  const res = createMockRes();
  await deleteFolder({ params: { id: "3" } }, res);
  assert.equal(res.statusCode, 404);
});

// ─── Verschieben ────────────────────────────────────────────────

function mockMove({ folderExists = true, carAboCount } = {}) {
  const log = { destroyed: [], created: [] };
  const restores = [
    mockTransaction(),
    patch(db.CarAboFolder, {
      findByPk: async (id) => (folderExists ? { id } : null),
    }),
    patch(db.CarAbo, {
      count: async ({ where }) => carAboCount ?? where.id.length,
    }),
    patch(db.CarAboFolderAssignment, {
      destroy: async ({ where }) => log.destroyed.push(where),
      bulkCreate: async (rows) => log.created.push(...rows),
    }),
  ];
  return { log, restore: () => restores.forEach((r) => r()) };
}

test("moveCarAbos replaces the folder of every selected vehicle", async (t) => {
  const { log, restore } = mockMove();
  t.after(restore);

  const res = createMockRes();
  await moveCarAbos({ body: { carAboIds: [37, 51], folderId: 2 } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { carAboIds: [37, 51], folderId: 2 });
  assert.deepEqual(log.destroyed, [{ carAboId: [37, 51] }]);
  assert.deepEqual(log.created, [
    { carAboId: 37, folderId: 2 },
    { carAboId: 51, folderId: 2 },
  ]);
});

test("moveCarAbos with folderId null moves vehicles to 'Ohne Ordner'", async (t) => {
  const { log, restore } = mockMove();
  t.after(restore);

  const res = createMockRes();
  await moveCarAbos({ body: { carAboIds: [37], folderId: null } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(log.destroyed, [{ carAboId: [37] }]);
  assert.deepEqual(log.created, []);
});

test("moveCarAbos returns 404 for an unknown folder and changes nothing", async (t) => {
  const { log, restore } = mockMove({ folderExists: false });
  t.after(restore);

  const res = createMockRes();
  await moveCarAbos({ body: { carAboIds: [37], folderId: 99 } }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(log.destroyed, []);
});

test("moveCarAbos returns 404 when a vehicle does not exist", async (t) => {
  const { log, restore } = mockMove({ carAboCount: 1 });
  t.after(restore);

  const res = createMockRes();
  await moveCarAbos({ body: { carAboIds: [37, 999], folderId: 2 } }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(log.destroyed, []);
});

test("moveCarAbos rejects invalid input with 400", async (t) => {
  const { log, restore } = mockMove();
  t.after(restore);

  for (const body of [
    { carAboIds: [], folderId: 1 },
    { carAboIds: [37], folderId: "abc" },
    { carAboIds: [37], folderId: 0 },
    { carAboIds: "37", folderId: 1 },
  ]) {
    const res = createMockRes();
    await moveCarAbos({ body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.deepEqual(log.destroyed, []);
});
