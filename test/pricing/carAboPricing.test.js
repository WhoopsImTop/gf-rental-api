"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getColorSurcharge,
  isWholeEuroSurcharge,
  getMatrixPrice,
  getMonthlyBasePrice,
  getContractMonthlyBasePrice,
  pickCarAboColor,
  resolveCarAboColor,
  computeContractPricing,
  isCartPriceCurrent,
  getDepositAdjustedPrice,
  roundMonthlyRate,
  DEPOSIT_FEE_FACTOR,
} = require("../../utils/carAboPricing");

const price = {
  id: 7,
  durationMonths: 12,
  mileageKm: 1500,
  priceFixedDuration: "499.00",
  priceMinimumDuration: "539.00",
};
const silver = { id: 1, colorName: "Mondsteinsilber", priceSurcharge: "0.00" };
const blue = { id: 2, colorName: "Aurora-Blau", priceSurcharge: "30.00" };

test("getColorSurcharge parses decimals, commas and ignores invalid values", () => {
  assert.equal(getColorSurcharge(blue), 30);
  assert.equal(getColorSurcharge({ priceSurcharge: "29,50" }), 29.5);
  assert.equal(getColorSurcharge({ priceSurcharge: 12.345 }), 12.35);
  assert.equal(getColorSurcharge({ priceSurcharge: "-10" }), 0);
  assert.equal(getColorSurcharge({ priceSurcharge: "abc" }), 0);
  assert.equal(getColorSurcharge({ priceSurcharge: "" }), 0);
  assert.equal(getColorSurcharge({}), 0);
  assert.equal(getColorSurcharge(null), 0);
});

test("getMatrixPrice picks the field for the duration type", () => {
  assert.equal(getMatrixPrice(price, "fixed"), 499);
  assert.equal(getMatrixPrice(price, "minimum"), 539);
  assert.equal(getMatrixPrice(price, undefined), 499);
});

test("getMatrixPrice returns NaN for missing or non-positive prices", () => {
  assert.ok(Number.isNaN(getMatrixPrice(null, "fixed")));
  assert.ok(Number.isNaN(getMatrixPrice({ priceFixedDuration: null }, "fixed")));
  assert.ok(Number.isNaN(getMatrixPrice({ priceFixedDuration: "0.00" }, "fixed")));
});

test("getMonthlyBasePrice adds the color surcharge to the matrix price", () => {
  assert.equal(getMonthlyBasePrice(price, "fixed", blue), 529);
  assert.equal(getMonthlyBasePrice(price, "minimum", blue), 569);
  assert.equal(getMonthlyBasePrice(price, "fixed", silver), 499);
  assert.equal(getMonthlyBasePrice(price, "fixed", null), 499);
});

test("getMonthlyBasePrice stays invalid when the matrix price is invalid, even with surcharge", () => {
  const broken = { priceFixedDuration: "0.00", priceMinimumDuration: null };
  assert.ok(Number.isNaN(getMonthlyBasePrice(broken, "fixed", blue)));
  assert.ok(Number.isNaN(getMonthlyBasePrice(broken, "minimum", blue)));
});

test("getContractMonthlyBasePrice uses the surcharge stored on the contract", () => {
  assert.equal(
    getContractMonthlyBasePrice({ price, durationType: "fixed", colorSurcharge: "30.00" }),
    529,
  );
  assert.equal(
    getContractMonthlyBasePrice({ price, durationType: "minimum", colorSurcharge: null }),
    539,
  );
  // Ohne Preisdatensatz wie bisher 0 statt NaN im PDF
  assert.equal(getContractMonthlyBasePrice({ durationType: "fixed" }), 0);
});

test("pickCarAboColor finds the color by numeric or string id", () => {
  assert.equal(pickCarAboColor([silver, blue], 2), blue);
  assert.equal(pickCarAboColor([silver, blue], "1"), silver);
});

test("pickCarAboColor rejects a color of another vehicle", () => {
  assert.throws(() => pickCarAboColor([silver, blue], 99), /COLOR_NOT_FOUND/);
  assert.throws(() => pickCarAboColor([], 1), /COLOR_NOT_FOUND/);
});

test("pickCarAboColor only requires a color when asked and the vehicle has colors", () => {
  assert.equal(pickCarAboColor([silver], null), null);
  assert.throws(
    () => pickCarAboColor([silver], undefined, { required: true }),
    /COLOR_REQUIRED/,
  );
  assert.equal(pickCarAboColor([], null, { required: true }), null);
});

test("resolveCarAboColor loads only the colors of the given vehicle", async () => {
  let receivedWhere = null;
  const fakeDb = {
    CarAboColor: {
      findAll: async ({ where }) => {
        receivedWhere = where;
        return [silver, blue];
      },
    },
  };
  const color = await resolveCarAboColor(fakeDb, 42, 2, { required: true });
  assert.equal(color, blue);
  assert.deepEqual(receivedWhere, { carAboId: 42 });
});

test("computeContractPricing matches the previous result when no surcharge is set", () => {
  const result = computeContractPricing({
    prices: [price],
    priceId: 7,
    colors: [silver],
    colorId: 1,
    durationType: "fixed",
    depositValue: "1000",
    insurancePackage: true,
    insuranceCosts: "39",
  });
  // 499 - (1000 * 1.025 / 12) + 39 = 452.58 -> 453
  assert.equal(result.monthlyPrice, 453);
  assert.equal(result.totalCost, 453 * 12);
  assert.equal(result.monthlyDepositDiscount, 85);
  assert.equal(result.colorSurcharge, 0);
  assert.equal(result.selectedPrice, price);
});

test("computeContractPricing adds the cart's color surcharge before deposit and insurance", () => {
  const result = computeContractPricing({
    prices: [price],
    priceId: 7,
    colors: [silver, blue],
    colorId: 2,
    cartColorSurcharge: "30.00",
    durationType: "minimum",
    depositValue: 0,
    insurancePackage: false,
  });
  assert.equal(result.basePrice, 569);
  assert.equal(result.calculatedMonthlyPrice, 569);
  assert.equal(result.monthlyPrice, 569);
  assert.equal(result.totalCost, 569 * 12);
  assert.equal(result.colorSurcharge, 30);
  assert.equal(result.selectedColor, blue);
});

// ─── Preis bleibt wie im Warenkorb ──────────────────────────────

test("computeContractPricing uses the surcharge seen in the cart, not the current one", () => {
  // Kunde hat 30 € gesehen, im CRM steht inzwischen 50 €
  const changedBlue = { ...blue, priceSurcharge: "50.00" };
  const result = computeContractPricing({
    prices: [price],
    priceId: 7,
    colors: [silver, changedBlue],
    colorId: 2,
    cartColorSurcharge: "30.00",
    durationType: "fixed",
    depositValue: 0,
  });
  assert.equal(result.colorSurcharge, 30);
  assert.equal(result.monthlyPrice, 529);
});

test("computeContractPricing charges no surcharge for legacy carts with a color", () => {
  // Altwarenkorb: Farbe gespeichert, aber noch kein Aufpreis-Snapshot
  const result = computeContractPricing({
    prices: [price],
    priceId: 7,
    colors: [silver, blue],
    colorId: 2,
    cartColorSurcharge: null,
    durationType: "fixed",
    depositValue: 0,
  });
  assert.equal(result.selectedColor, blue);
  assert.equal(result.colorSurcharge, 0);
  assert.equal(result.monthlyPrice, 499);
});

test("computeContractPricing rounds exactly like the cart and the checkout display", () => {
  // Rohwert knapp unter ,50: 446.4999... -> toFixed(2) = 446.50 -> 447 (wie syncCart)
  const tricky = { ...price, durationMonths: 3, priceFixedDuration: "500.00" };
  const deposit = ((500 - 446.4999) * 3) / DEPOSIT_FEE_FACTOR;
  const raw = getDepositAdjustedPrice(500, deposit, 3);
  const result = computeContractPricing({
    prices: [tricky],
    priceId: 7,
    colors: [],
    colorId: null,
    durationType: "fixed",
    depositValue: deposit,
    insurancePackage: true,
    insuranceCosts: "39.90",
  });
  assert.equal(result.calculatedMonthlyPrice, roundMonthlyRate(raw));
  assert.equal(result.calculatedMonthlyPrice, 447);
  // Checkout zeigt round(calculatedMonthlyPrice + Versicherung)
  assert.equal(result.monthlyPrice, Math.round(447 + 39.9));
});

test("isCartPriceCurrent detects a changed price and tolerates carts without price", () => {
  assert.equal(isCartPriceCurrent(529, 529), true);
  assert.equal(isCartPriceCurrent("529", 529), true);
  assert.equal(isCartPriceCurrent(499, 529), false);
  assert.equal(isCartPriceCurrent(null, 529), true);
  assert.equal(isCartPriceCurrent(undefined, 529), true);
});

test("computeContractPricing keeps legacy carts without color working, without surcharge", () => {
  // Altwarenkorb: Fahrzeug hat Farben, im Warenkorb ist aber keine gespeichert
  const result = computeContractPricing({
    prices: [price],
    priceId: 7,
    colors: [silver, blue],
    colorId: null,
    durationType: "fixed",
    depositValue: 0,
    insurancePackage: false,
  });
  assert.equal(result.selectedColor, null);
  assert.equal(result.colorSurcharge, 0);
  assert.equal(result.monthlyPrice, 499);
  assert.equal(result.totalCost, 499 * 12);
});

test("computeContractPricing rejects unknown prices and foreign colors", () => {
  assert.throws(
    () => computeContractPricing({ prices: [price], priceId: 8, colors: [], colorId: null }),
    /PRICE_CONFIGURATION_INVALID/,
  );
  assert.throws(
    () => computeContractPricing({ prices: [price], priceId: 7, colors: [silver], colorId: 2 }),
    /COLOR_NOT_FOUND/,
  );
  assert.throws(
    () =>
      computeContractPricing({
        prices: [{ ...price, durationMonths: 0 }],
        priceId: 7,
        colors: [],
        colorId: null,
      }),
    /PRICE_CONFIGURATION_INVALID/,
  );
});

test("isWholeEuroSurcharge allows whole euros and empty values only", () => {
  for (const value of [30, "30", "30.00", "30,00", 0, "", null, undefined, "-5", "abc"]) {
    assert.equal(isWholeEuroSurcharge(value), true, String(value));
  }
  for (const value of ["29,50", 29.5, "0.99", "10.01"]) {
    assert.equal(isWholeEuroSurcharge(value), false, String(value));
  }
});
