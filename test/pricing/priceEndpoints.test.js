"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createMockRes, patch } = require("../helpers/stubSideEffects");
const db = require("../../models");
const {
  calculatePrice,
  createCarAbo,
  updateCarAbo,
  _internals: carAboInternals,
} = require("../../controllers/carAboController");
const { syncCart } = require("../../controllers/cartController");

const price = {
  id: 7,
  durationMonths: 12,
  mileageKm: 1500,
  priceFixedDuration: "499.00",
  priceMinimumDuration: "539.00",
};
const colors = [
  { id: 1, carAboId: 42, colorName: "Mondsteinsilber", priceSurcharge: "0.00" },
  { id: 2, carAboId: 42, colorName: "Aurora-Blau", priceSurcharge: "30.00" },
];

function mockVehicle() {
  return patch(db.CarAbo, {
    findByPk: async () => ({ id: 42, prices: [price] }),
  });
}

function mockColors(list = colors) {
  return patch(db.CarAboColor, {
    findAll: async ({ where }) => list.filter((c) => c.carAboId === where.carAboId),
  });
}

// ─── calculate-price ────────────────────────────────────────────

test("calculatePrice without colorId keeps the matrix price (old clients)", async (t) => {
  t.after(mockVehicle());
  t.after(mockColors());
  const res = createMockRes();
  await calculatePrice(
    { params: { id: "42" }, body: { durationMonths: 12, mileageKm: 1500, depositValue: 0 } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.monthlyPrice, "499.00");
  assert.equal(res.body.colorSurcharge, "0.00");
});

test("calculatePrice adds the surcharge of the chosen color", async (t) => {
  t.after(mockVehicle());
  t.after(mockColors());
  const res = createMockRes();
  await calculatePrice(
    {
      params: { id: "42" },
      body: { durationMonths: 12, mileageKm: 1500, depositValue: 0, colorId: 2 },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.monthlyPrice, "529.00");
  assert.equal(res.body.totalCost, "6348.00");
  assert.equal(res.body.colorSurcharge, "30.00");
});

test("calculatePrice applies the surcharge to the minimum-duration price with deposit", async (t) => {
  t.after(mockVehicle());
  t.after(mockColors());
  const res = createMockRes();
  await calculatePrice(
    {
      params: { id: "42" },
      body: {
        durationMonths: 12,
        mileageKm: 1500,
        depositValue: 1200,
        durationType: "minimum",
        colorId: 2,
      },
    },
    res,
  );
  // (539 + 30) - 1200 * 1.025 / 12 = 466.5 -> 467
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.monthlyPrice, "467.00");
  assert.equal(res.body.depositValue, "1200.00");
});

test("calculatePrice rejects a color of another vehicle with 400", async (t) => {
  t.after(mockVehicle());
  t.after(mockColors([...colors, { id: 9, carAboId: 77, priceSurcharge: "0" }]));
  const res = createMockRes();
  await calculatePrice(
    { params: { id: "42" }, body: { durationMonths: 12, mileageKm: 1500, colorId: 9 } },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Farbe/);
});

test("normalizeColorPayload turns CRM input into a valid surcharge", () => {
  const { normalizeColorPayload } = carAboInternals;
  assert.equal(normalizeColorPayload({ priceSurcharge: "29,50" }).priceSurcharge, 29.5);
  assert.equal(normalizeColorPayload({ priceSurcharge: "" }).priceSurcharge, 0);
  assert.equal(normalizeColorPayload({ priceSurcharge: -5 }).priceSurcharge, 0);
  // Fehlt das Feld, bleibt der gespeicherte Wert beim Update unangetastet
  assert.equal("priceSurcharge" in normalizeColorPayload({ colorName: "Rot" }), false);
});

test("findDecimalSurchargeColors flags cent amounts only", () => {
  const { findDecimalSurchargeColors } = carAboInternals;
  const flagged = findDecimalSurchargeColors([
    { colorName: "Rot", priceSurcharge: "29,50" },
    { colorName: "Blau", priceSurcharge: 30 },
    { colorName: "Weiß", priceSurcharge: "" },
    { colorName: "Grün", priceSurcharge: "10.00" },
    { colorName: "Ohne Feld" },
  ]);
  assert.deepEqual(flagged.map((c) => c.colorName), ["Rot"]);
  assert.deepEqual(findDecimalSurchargeColors(undefined), []);
});

for (const [name, handler, params] of [
  ["createCarAbo", createCarAbo, {}],
  ["updateCarAbo", updateCarAbo, { id: "42" }],
]) {
  test(`${name} rejects a surcharge with cents before touching the database`, async () => {
    const restore = patch(db.sequelize, {
      transaction: async () => {
        throw new Error("transaction must not start");
      },
    });
    try {
      const res = createMockRes();
      await handler(
        {
          params,
          body: {
            displayName: "Test",
            colors: [{ colorName: "Rot", priceSurcharge: "29,50" }],
          },
        },
        res,
      );
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /ganzer Euro-Betrag/);
    } finally {
      restore();
    }
  });
}

// ─── cart/sync ──────────────────────────────────────────────────

function mockCartVehicle() {
  return patch(db.CarAbo, {
    findByPk: async () => ({ id: 42, prices: [price] }),
  });
}

function mockCartCreate() {
  const created = [];
  const restore = patch(db.Cart, {
    findOne: async () => null,
    create: async (data) => {
      created.push(data);
      return { ...data, accessToken: "token-123", toJSON: () => ({ ...data }) };
    },
  });
  return { created, restore };
}

const cartBody = (overrides = {}) => ({
  body: {
    cartContent: {
      carAboId: 42,
      priceId: 7,
      durationType: "fixed",
      depositValue: 0,
      ...overrides,
    },
  },
  headers: {},
  socket: {},
});

test("syncCart stores the monthly price including the color surcharge", async (t) => {
  t.after(mockCartVehicle());
  t.after(mockColors());
  const { created, restore } = mockCartCreate();
  t.after(restore);

  const res = createMockRes();
  await syncCart(cartBody({ colorId: 2, calculatedMonthlyPrice: 1 }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0].calculatedMonthlyPrice, 529);
  assert.equal(created[0].colorId, 2);
  // Gesehener Aufpreis wird für den Vertragsabschluss festgehalten
  assert.equal(created[0].colorSurcharge, 30);
});

test("syncCart stores surcharge 0 for a color without surcharge", async (t) => {
  t.after(mockCartVehicle());
  t.after(mockColors());
  const { created, restore } = mockCartCreate();
  t.after(restore);

  await syncCart(cartBody({ colorId: 1 }), createMockRes());
  assert.equal(created[0].colorSurcharge, 0);
  assert.equal(created[0].calculatedMonthlyPrice, 499);
});

test("syncCart updates the surcharge snapshot on an existing cart", async (t) => {
  t.after(mockCartVehicle());
  t.after(mockColors());
  const existing = {
    accessToken: "a".repeat(64),
    completed: false,
    colorSurcharge: null,
    save: async () => {},
    toJSON() {
      return { ...this };
    },
  };
  t.after(patch(db.Cart, { findOne: async () => existing }));

  const req = cartBody({ colorId: 2 });
  req.body.accessToken = existing.accessToken;
  const res = createMockRes();
  await syncCart(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(existing.colorSurcharge, 30);
  assert.equal(existing.calculatedMonthlyPrice, 529);
});

test("syncCart ignores a manipulated client price", async (t) => {
  t.after(mockCartVehicle());
  t.after(mockColors());
  const { created, restore } = mockCartCreate();
  t.after(restore);

  await syncCart(cartBody({ colorId: 2, calculatedMonthlyPrice: 100 }), createMockRes());
  assert.equal(created[0].calculatedMonthlyPrice, 529);
});

test("syncCart requires a color when the vehicle has colors", async (t) => {
  t.after(mockCartVehicle());
  t.after(mockColors());
  const { created, restore } = mockCartCreate();
  t.after(restore);

  const res = createMockRes();
  await syncCart(cartBody({ colorId: null }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Farbe/);
  assert.equal(created.length, 0);
});

test("syncCart rejects a color of another vehicle", async (t) => {
  t.after(mockCartVehicle());
  t.after(mockColors([...colors, { id: 9, carAboId: 77, priceSurcharge: "0" }]));
  const { created, restore } = mockCartCreate();
  t.after(restore);

  const res = createMockRes();
  await syncCart(cartBody({ colorId: 9 }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(created.length, 0);
});

test("syncCart caps the deposit using the price including surcharge", async (t) => {
  // 2 Monate × (100 + 30) € = 260 € Budget -> max. Anzahlung floor((260-0.01)/1.025 / 50) * 50 = 250 €
  t.after(
    patch(db.CarAbo, {
      findByPk: async () => ({
        id: 42,
        prices: [{ ...price, durationMonths: 2, priceFixedDuration: "100.00" }],
      }),
    }),
  );
  t.after(mockColors());
  const { created, restore } = mockCartCreate();
  t.after(restore);

  const res = createMockRes();
  await syncCart(cartBody({ colorId: 2, depositValue: 5000 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(created[0].depositValue, 250);
  // 130 - 250 * 1.025 / 2 = 1.875 -> 2
  assert.equal(created[0].calculatedMonthlyPrice, 2);
});
