import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createPdf } from "../js/pdf.js";
const sandbox = {
  console,
  TextEncoder,
  TextDecoder,
  atob,
  btoa,
  Uint8Array,
  ArrayBuffer,
};
sandbox.self = sandbox;
vm.runInNewContext(
  fs.readFileSync(
    new URL("../vendor/jspdf.umd.min.js", import.meta.url),
    "utf8",
  ),
  sandbox,
);
const calls = [];
class TrackedPdf extends sandbox.jspdf.jsPDF {
  constructor(options) {
    super(options);
    const text = this.text;
    this.text = function (...args) {
      calls.push({
        args,
        font: this.getFont().fontStyle,
        page: this.getCurrentPageInfo().pageNumber,
      });
      return text.apply(this, args);
    };
  }
}
globalThis.window = { jspdf: { jsPDF: TrackedPdf } };
globalThis.fetch = async (url) =>
  new Response(
    fs.readFileSync(new URL("../" + url.replace("./", ""), import.meta.url)),
  );
test("PDF labels and colons are bold, values regular, counts centered and every page is numbered i/n", async () => {
  const record = {
    header: {
      excavationSite: "Dime",
      area: "A12",
      stratUnit: "1045",
      room: "3",
    },
    rows: Array.from({ length: 90 }, (_, i) => ({
      typeForm: "Bowl " + i,
      rims: "7",
      handles: "2",
      feet: "0",
      bodies: "12",
    })),
    remarks: "Notes",
  };
  const doc = await createPdf(record, "");
  assert.ok(doc.getNumberOfPages() > 1);
  for (const label of [
    "Excavation site:",
    "Area:",
    "Stratigraphic unit:",
    "Room:",
  ])
    assert.ok(calls.some((c) => c.args[0] === label && c.font === "bold"));
  assert.ok(calls.some((c) => c.args[0] === "Dime" && c.font === "normal"));
  const numbers = calls.filter((c) => c.args[0] === "7");
  assert.equal(numbers.length, 90);
  for (const call of numbers) {
    assert.equal(call.args[3].align, "center");
    assert.equal(call.args[3].baseline, "middle");
    assert.equal(call.args[1], 46.5);
  }
  const count = doc.getNumberOfPages();
  for (let i = 1; i <= count; i++)
    assert.ok(
      calls.some(
        (c) =>
          c.page === i &&
          c.args[0] === `${i}/${count}` &&
          c.args[3].align === "right",
      ),
    );
});
