import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (name) =>
  fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup({ app = true, standalone = false } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM(read("index.html"), {
    url: "https://example.org/archeologia/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window: w } = dom;
  w.matchMedia = () => ({ matches: standalone });
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    return {
      canvas: this,
      clearRect() {},
      fillRect() {},
      drawImage() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      arc() {},
      fill() {},
    };
  };
  w.HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  const downloads = [];
  w.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:example";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.eval(read("pwa-install.js"));
  w.eval(read("bootstrap.js"));
  if (app) w.eval(read("app.bundle.js"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const $ = (selector) => w.document.querySelector(selector);
  return { dom, w, $, errors, downloads };
}
function blobText(w, blob) {
  return new Promise((resolve, reject) => {
    const reader = new w.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

test("new sheet opens, numeric fields accept counts, reset No preserves data and Yes clears it", async () => {
  const { dom, w, $, errors } = setup();
  try {
    assert.equal(w.CeramicAppReady, true);
    assert.equal($("#new").disabled, false);
    $("#new").click();
    assert.equal($("#form-view").hidden, false);
    assert.equal($("#rows").children.length, 4);
    $("#area").value = "A12";
    $("#area").dispatchEvent(new w.Event("input", { bubbles: true }));
    const numeric = $('#rows tr input[data-key="rims"]');
    assert.equal(numeric.inputMode, "numeric");
    numeric.value = "12abc";
    numeric.dispatchEvent(new w.Event("input"));
    assert.equal(numeric.value, "12");
    $("#reset-sheet").click();
    assert.equal($("#reset-dialog").open, true);
    $("#reset-no").click();
    assert.equal($("#area").value, "A12");
    $("#reset-sheet").click();
    $("#reset-yes").click();
    assert.equal($("#home").hidden, false);
    assert.equal($("#area").value, "");
    $("#new").click();
    assert.equal($("#form-view").hidden, false);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});
test("install opens instructions independently of the editor", async () => {
  const { dom, $ } = setup({ app: false });
  try {
    $("#install").click();
    assert.equal($("#install-dialog").open, true);
    assert.match($("#install-help").textContent, /Chrome/);
    $("#install-close").click();
    assert.equal($("#install-dialog").open, false);
  } finally {
    await tick();
    dom.window.close();
  }
});
test("install invokes native prompt, handles rejection and hides button when installed", async () => {
  const { dom, w, $, errors } = setup();
  try {
    let prompted = 0;
    const event = new w.Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => {
      prompted++;
    };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    w.dispatchEvent(event);
    $("#install").click();
    await tick();
    assert.equal(prompted, 1);
    assert.equal($("#install").disabled, false);
    const failed = new w.Event("beforeinstallprompt", { cancelable: true });
    failed.prompt = async () => {
      throw Error("unavailable");
    };
    w.dispatchEvent(failed);
    $("#install").click();
    await tick();
    assert.equal($("#install-dialog").open, true);
    w.dispatchEvent(new w.Event("appinstalled"));
    assert.equal($("#install").hidden, true);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});
test("JSON export includes entered values and sketch strokes after undo and redo", async () => {
  const { dom, w, $, errors, downloads } = setup();
  try {
    $("#new").click();
    $("#excavationSite").value = "Dime";
    $("#area").value = "A12";
    $("#open-sketch").click();
    await tick();
    assert.equal($("#sketch-dialog").open, true);
    const canvas = $("#canvas");
    canvas.setPointerCapture = () => {};
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1200,
      height: 900,
    });
    const pointer = (name, x, y) => {
      const event = new w.Event(name, { cancelable: true });
      Object.assign(event, {
        pointerType: "pen",
        pointerId: 1,
        clientX: x,
        clientY: y,
      });
      canvas.dispatchEvent(event);
    };
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 300, 500);
    pointer("pointerup", 300, 500);
    assert.equal($("#undo").disabled, false);
    $("#undo").click();
    assert.equal($("#redo").disabled, false);
    $("#redo").click();
    $("#save-sketch").click();
    await tick();
    assert.equal($("#sketch-dialog").open, false);
    assert.equal($("#sketch-preview").hidden, false);
    $("#json").click();
    await tick();
    const record = JSON.parse(await blobText(w, downloads[0]));
    assert.equal(record.header.excavationSite, "Dime");
    assert.equal(record.header.area, "A12");
    assert.equal(record.sketch.strokes.length, 1);
    assert.equal(record.sketch.strokes[0].points.length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});
test("every button uses text only", async () => {
  const { dom, $ } = setup();
  try {
    for (const button of dom.window.document.querySelectorAll("button"))
      assert.doesNotMatch(button.textContent, /[↓↶↷✎+]/);
  } finally {
    await tick();
    dom.window.close();
  }
});

test("legacy import fills the form and malformed JSON preserves existing values", async () => {
  const { dom, w, $, errors } = setup();
  try {
    const input = $("#json-file");
    const record = {
      header: { area: "A9", stratUnit: "75", room: "2" },
      rows: [{ typeForm: "Jar", rims: "4" }],
      remarks: "Note precedenti",
    };
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ size: 500, text: async () => JSON.stringify(record) }],
    });
    await input.onchange({ target: input });
    assert.equal($("#form-view").hidden, false);
    assert.equal($("#area").value, "A9");
    assert.equal($("#remarks").value, "Note precedenti");
    assert.equal($('#rows input[data-key="rims"]').value, "4");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [{ size: 20, text: async () => "{invalid" }],
    });
    await input.onchange({ target: input });
    assert.equal($("#area").value, "A9");
    assert.match($("#status").textContent, /Importazione non riuscita/);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});
