"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../helpers/stubSideEffects");
const { formatColorLabel } = require("../../services/notification/order");

test("admin order mail shows the color with its surcharge", () => {
  assert.equal(
    formatColorLabel({ colorName: "Aurora-Blau" }, "30.00"),
    "Aurora-Blau (+30.00 € Farbaufpreis/Monat)",
  );
});

test("admin order mail shows only the name without surcharge", () => {
  assert.equal(formatColorLabel({ colorName: "Mondsteinsilber" }, "0.00"), "Mondsteinsilber");
  assert.equal(formatColorLabel({ colorName: "Mondsteinsilber" }, null), "Mondsteinsilber");
  assert.equal(formatColorLabel(null, null), "-");
});

test("admin order mail escapes the color name", () => {
  assert.equal(
    formatColorLabel({ colorName: "<b>Rot</b>" }, 0),
    "&lt;b&gt;Rot&lt;/b&gt;",
  );
});
