import test from "node:test";
import assert from "node:assert/strict";
import { filename, filledRows, parseRecord } from "../js/data.js";
test("filename uses local 24h time and all four identifiers", () =>
  assert.equal(
    filename(
      { excavationSite: "Dime", area: "A12", stratUnit: "1045", room: "3" },
      new Date(2026, 9, 26, 15, 8),
    ),
    "Dime_A12_1045_3_2026_10_26_15_08",
  ));
test("empty rows excluded but zero is meaningful", () =>
  assert.equal(
    filledRows([{}, { typeForm: " " }, { rims: "0" }, { typeForm: "Bowl" }])
      .length,
    2,
  ));
test("legacy JSON imports header rows remarks", () => {
  const data = parseRecord({
    header: { area: "A" },
    rows: [{ rims: 2 }],
    remarks: "test",
  });
  assert.equal(data.header.area, "A");
  assert.equal(data.rows[0].rims, "2");
});
test("reject negative counts and external image sources", () => {
  assert.throws(() => parseRecord({ header: {}, rows: [{ rims: -1 }] }));
  assert.throws(() =>
    parseRecord({
      header: {},
      rows: [],
      sketchPng: "https://example.org/image.png",
    }),
  );
});
test("reject invalid stroke coordinates", () =>
  assert.throws(() =>
    parseRecord({
      schema: "ceramic-summary-form-pwa-v3",
      header: {},
      rows: [],
      sketch: { strokes: [{ tool: "pen", width: 2, points: [[2, 0]] }] },
    }),
  ));
test("safe filename removes filesystem reserved characters", () =>
  assert.ok(!filename({ excavationSite: "Site/A:*" }).includes("/")));
