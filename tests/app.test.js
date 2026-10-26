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
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP8//8/AwwwMSAB3BwAlm4DBfIlvvkAAAAASUVORK5CYII=";
  const viewport = w.document.querySelector("#sketch-viewport");
  Object.defineProperty(viewport, "clientWidth", { value: 1000 });
  Object.defineProperty(viewport, "clientHeight", { value: 700 });
  viewport.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1000,
    height: 700,
  });
  const downloads = [];
  const downloadNames = [];
  w.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:example";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloadNames.push(this.download);
  };
  w.eval(read("pwa-install.js"));
  w.eval(read("bootstrap.js"));
  if (app) w.eval(read("app.bundle.js"));
  w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  const $ = (selector) => w.document.querySelector(selector);
  return { dom, w, $, errors, downloads, downloadNames };
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
    assert.equal($("#rows").children.length, 1);
    $("#add-row").click();
    assert.equal($("#rows").children.length, 2);
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
test("one export produces PDF and JSON with matching names and restored sketch strokes", async () => {
  const { dom, w, $, errors, downloads, downloadNames } = setup();
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
      const event = new w.Event(name, { cancelable: true, bubbles: true });
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
    enablePdf(w);
    await $("#export-files").onclick();
    assert.equal(downloads.length, 2, $("#status").textContent);
    assert.equal($("#export-links"), null);
    assert.equal($("#download-pdf"), null);
    assert.equal($("#download-json"), null);
    assert.doesNotMatch(
      $("#status").textContent,
      /PDF and JSON are ready|Files ready/,
    );
    assert.equal(downloads[0].type, "application/pdf");
    assert.ok(downloads[0].size > 1000);
    assert.equal(
      downloadNames[0].replace(/\.pdf$/, ""),
      downloadNames[1].replace(/\.json$/, ""),
    );
    const record = JSON.parse(await blobText(w, downloads[1]));
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
    assert.match($("#status").textContent, /Import failed/);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});

function enablePdf(w) {
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.eval(read("vendor/jspdf.umd.min.js"));
  w.fetch = async (url) => {
    const bytes = fs.readFileSync(
      new URL("../" + url.replace("./", ""), import.meta.url),
    );
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  };
}

test("layout, placeholders and all Sketch controls are in their requested locations", async () => {
  const { dom, $ } = setup();
  try {
    assert.equal(
      $("#stratUnit").closest("label").textContent.trim(),
      "Stratigraphic unit",
    );
    assert.ok($(".left-column .metadata"));
    assert.ok($(".left-column .fragments"));
    assert.ok($(".right-column #remarks"));
    assert.ok($(".right-column #open-sketch"));
    assert.equal($("#remarks").placeholder, "Type here...");
    assert.equal($("#sketch-placeholder").textContent.trim(), "Tap to draw");
    assert.equal($("#sketch-title").textContent, "Sketch");
    assert.deepEqual(
      [...$("#sketch-dialog header").querySelectorAll("button")].map(
        (b) => b.textContent,
      ),
      ["Save", "Back"],
    );
    assert.deepEqual(
      [...$(".navigation-row").children].map((b) => b.id),
      ["pan", "zoom-in", "zoom-level", "zoom-out", "fit-sketch"],
    );
    assert.deepEqual(
      [...$(".drawing-row").querySelectorAll("button")].map((b) => b.id),
      ["pen", "eraser", "undo", "redo", "clear"],
    );
    assert.equal($("#pdf"), null);
    assert.equal($("#json"), null);
  } finally {
    await tick();
    dom.window.close();
  }
});

test("Penna and Gomma are explicit modes, zoom does not change exported stroke coordinates", async () => {
  const { dom, w, $, downloads, errors } = setup();
  try {
    $("#new").click();
    $("#open-sketch").click();
    await tick();
    $("#eraser").click();
    assert.equal($("#sketch-viewport").dataset.tool, "eraser");
    $("#eraser").click();
    assert.equal($("#sketch-viewport").dataset.tool, "eraser");
    $("#pen").click();
    assert.equal($("#sketch-viewport").dataset.tool, "pen");
    $("#zoom-in").click();
    assert.equal($("#zoom-level").value, "125%");
    $("#fit-sketch").click();
    assert.equal($("#zoom-level").value, "100%");
    $("#save-sketch").click();
    enablePdf(w);
    await $("#export-files").onclick();
    const record = JSON.parse(await blobText(w, downloads[1]));
    assert.equal(record.sketch.strokes.length, 0);
    assert.equal("zoom" in record.sketch, false);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});

test("two-finger pinch zooms without leaving a provisional drawing stroke", async () => {
  const { dom, w, $, downloads, errors } = setup();
  try {
    $("#new").click();
    $("#open-sketch").click();
    await tick();
    const canvas = $("#canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1200,
      height: 900,
    });
    const pointer = (name, id, x, y) => {
      const event = new w.Event(name, { cancelable: true, bubbles: true });
      Object.assign(event, {
        pointerType: "touch",
        pointerId: id,
        clientX: x,
        clientY: y,
        button: 0,
      });
      canvas.dispatchEvent(event);
    };
    pointer("pointerdown", 1, 200, 200);
    pointer("pointerdown", 2, 400, 200);
    pointer("pointermove", 2, 500, 200);
    assert.equal($("#zoom-level").value, "150%");
    pointer("pointerup", 2, 500, 200);
    pointer("pointerup", 1, 200, 200);
    $("#save-sketch").click();
    enablePdf(w);
    await $("#export-files").onclick();
    const record = JSON.parse(await blobText(w, downloads[1]));
    assert.equal(record.sketch.strokes.length, 0);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});

test("stylus takes over an initial finger contact and ignores the palm while drawing", async () => {
  const { dom, w, $, downloads, errors } = setup();
  try {
    $("#new").click();
    $("#open-sketch").click();
    await tick();
    const canvas = $("#canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1200,
      height: 900,
    });
    const pointer = (name, id, type, x, y) => {
      const event = new w.Event(name, { cancelable: true, bubbles: true });
      Object.assign(event, {
        pointerType: type,
        pointerId: id,
        clientX: x,
        clientY: y,
        button: 0,
      });
      canvas.dispatchEvent(event);
    };
    pointer("pointerdown", 1, "touch", 200, 200);
    pointer("pointerdown", 2, "pen", 100, 100);
    pointer("pointerdown", 3, "touch", 500, 500);
    pointer("pointermove", 2, "pen", 300, 300);
    pointer("pointerup", 2, "pen", 300, 300);
    $("#save-sketch").click();
    enablePdf(w);
    await $("#export-files").onclick();
    const record = JSON.parse(await blobText(w, downloads[1]));
    assert.equal(record.sketch.strokes.length, 1);
    assert.equal(record.sketch.strokes[0].points.length, 2);
    assert.deepEqual(errors, []);
  } finally {
    await tick();
    dom.window.close();
  }
});

test("Remove row keeps one initial row and confirms removal of filled rows", async () => {
  const { dom, $ } = setup();
  try {
    $("#new").click();
    assert.equal($("#remove-row").disabled, true);
    $("#add-row").click();
    assert.equal($("#remove-row").disabled, false);
    $("#remove-row").click();
    assert.equal($("#rows").children.length, 1);
    $("#add-row").click();
    $("#rows").lastElementChild.querySelector("input").value = "Bowl";
    $("#remove-row").click();
    assert.equal($("#remove-dialog").open, true);
    $("#remove-no").click();
    assert.equal($("#rows").children.length, 2);
    $("#remove-row").click();
    $("#remove-yes").click();
    assert.equal($("#rows").children.length, 1);
    assert.equal($("#remove-row").disabled, true);
  } finally {
    await tick();
    dom.window.close();
  }
});
test("Back saves the sketch and returns to the compilation form without clearing fields", async () => {
  const { dom, w, $, downloads } = setup();
  try {
    $("#new").click();
    $("#area").value = "A5";
    $("#open-sketch").click();
    await tick();
    const canvas = $("#canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1200,
      height: 900,
    });
    for (const [name, x, y] of [
      ["pointerdown", 100, 100],
      ["pointermove", 200, 300],
      ["pointerup", 200, 300],
    ]) {
      const event = new w.Event(name, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerType: "pen",
        pointerId: 1,
        clientX: x,
        clientY: y,
        button: 0,
      });
      canvas.dispatchEvent(event);
    }
    $("#back-sketch").click();
    await tick();
    assert.equal($("#sketch-dialog").open, false);
    assert.equal($("#form-view").hidden, false);
    assert.equal($("#area").value, "A5");
    enablePdf(w);
    await $("#export-files").onclick();
    const record = JSON.parse(await blobText(w, downloads[1]));
    assert.equal(record.sketch.strokes.length, 1);
  } finally {
    await tick();
    dom.window.close();
  }
});
test("capture viewport retains the selected pen or eraser cursor, with uniform compact buttons", async () => {
  const { dom, w, $ } = setup();
  try {
    const style = w.document.createElement("style");
    style.textContent = read("styles.css");
    w.document.head.append(style);
    $("#new").click();
    $("#open-sketch").click();
    await tick();
    const viewport = $("#sketch-viewport");
    let capture;
    viewport.setPointerCapture = (id) => (capture = id);
    const canvas = $("#canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 1200,
      height: 900,
    });
    for (const [tool, filename] of [
      ["pen", "cursor-pen.svg"],
      ["eraser", "cursor-eraser.svg"],
    ]) {
      $("#" + tool).click();
      const event = new w.Event("pointerdown", {
        bubbles: true,
        cancelable: true,
      });
      Object.assign(event, {
        pointerId: 5,
        pointerType: "mouse",
        clientX: 100,
        clientY: 100,
        button: 0,
      });
      canvas.dispatchEvent(event);
      assert.equal(capture, 5);
      assert.ok(w.getComputedStyle(viewport).cursor.includes(filename));
      const end = new w.Event("pointerup", { bubbles: true });
      Object.assign(end, { pointerId: 5 });
      viewport.dispatchEvent(end);
    }
    for (const button of $("#sketch-dialog").querySelectorAll("button"))
      assert.equal(w.getComputedStyle(button).width, "104px");
  } finally {
    await tick();
    dom.window.close();
  }
});

test("Sketch prompts stay inside the rounded preview, in its top-left corner", async () => {
  const { dom, w, $ } = setup();
  try {
    const style = w.document.createElement("style");
    style.textContent = read("styles.css");
    w.document.head.append(style);
    assert.equal($("#open-sketch").contains($("#sketch-placeholder")), true);
    assert.equal($("#open-sketch").contains($("#sketch-hint")), true);
    assert.equal($("#sketch-placeholder").textContent.trim(), "Tap to draw");
    assert.equal($("#sketch-hint").textContent.trim(), "Tap to edit");
    assert.equal(w.getComputedStyle($("#open-sketch")).overflow, "hidden");
    assert.equal(w.getComputedStyle($("#open-sketch")).borderRadius, "7px");
    for (const id of ["#sketch-placeholder", "#sketch-hint"]) {
      const css = w.getComputedStyle($(id));
      assert.equal(css.position, "absolute");
      assert.equal(css.top, "10px");
      assert.equal(css.left, "10px");
    }
    const headers = [...dom.window.document.querySelectorAll("th")].slice(1);
    for (const header of headers) {
      const css = w.getComputedStyle(header);
      assert.equal(css.textAlign, "center");
      assert.equal(css.verticalAlign, "middle");
    }
    $("#new").click();
    $("#open-sketch").click();
    await tick();
    $("#save-sketch").click();
    await tick();
    assert.equal($("#sketch-placeholder").hidden, false);
    assert.equal($("#sketch-hint").hidden, true);
  } finally {
    await tick();
    dom.window.close();
  }
});

test("iPhone, Android and iPad desktop mode each download one ZIP containing both files", async () => {
  for (const device of [
    {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
    {
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
    },
    {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    },
  ]) {
    const { dom, w, $, downloads, downloadNames, errors } = setup();
    try {
      for (const [key, value] of Object.entries(device))
        Object.defineProperty(w.navigator, key, { configurable: true, value });
      w.setImmediate = setImmediate;
      w.clearImmediate = clearImmediate;
      w.eval(read("vendor/jszip.min.js"));
      enablePdf(w);
      $("#new").click();
      $("#excavationSite").value = "Dime";
      $("#area").value = "A12";
      await $("#export-files").onclick();
      assert.equal(downloads.length, 1, $("#status").textContent);
      assert.equal(downloads[0].type, "application/zip");
      assert.match(downloadNames[0], /^Dime_A12_.*\.zip$/);
      const bytes = await new Promise((resolve, reject) => {
        const reader = new w.FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(downloads[0]);
      });
      const archive = await w.JSZip.loadAsync(bytes);
      const names = Object.keys(archive.files);
      assert.equal(names.length, 2);
      const stem = downloadNames[0].replace(/\.zip$/, "");
      assert.ok(names.includes(stem + ".pdf"));
      assert.ok(names.includes(stem + ".json"));
      const pdf = await archive.file(stem + ".pdf").async("string");
      assert.ok(pdf.startsWith("%PDF-"));
      const record = JSON.parse(
        await archive.file(stem + ".json").async("string"),
      );
      assert.equal(record.header.area, "A12");
      assert.equal($("#export-links"), null);
      assert.equal($("#export-files").disabled, false);
      assert.deepEqual(errors, []);
    } finally {
      await tick();
      dom.window.close();
    }
  }
});
