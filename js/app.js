import {
  COLUMNS,
  HEADER,
  emptyRow,
  emptySketch,
  filename,
  parseRecord,
  clone,
} from "./data.js";
import { SketchEditor, sketchPng } from "./sketch.js";
import { createPdf } from "./pdf.js";
import { needsArchive, createArchive } from "./export-archive.js";
const $ = (selector) => document.querySelector(selector);
let sketch = emptySketch(),
  dirty = false,
  busy = false;
let revision = 0;
let createdAt = new Date().toISOString();
function notify(message) {
  $("#status").textContent = message;
  $("#status").hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("#status").hidden = true), 6000);
}
function grow() {
  const box = $("#remarks");
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight}px`;
}
function row(values = emptyRow()) {
  const tr = document.createElement("tr");
  COLUMNS.forEach((key, index) => {
    const td = document.createElement("td"),
      input = document.createElement("input");
    // Text + numeric inputMode avoids spin controls while requesting the numeric keyboard.
    input.type = "text";
    input.inputMode = index ? "numeric" : "text";
    input.value = values[key];
    input.dataset.key = key;
    input.maxLength = index ? 12 : 1000;
    input.setAttribute(
      "aria-label",
      `${["Type/Form", "Rims", "Handles", "Feet", "Bodies"][index]} – row ${$("#rows").children.length + 1}`,
    );
    if (index) {
      input.pattern = "[0-9]*";
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9]/g, "");
      });
    }
    td.append(input);
    tr.append(td);
  });
  $("#rows").append(tr);
  updateRemoveButton();
}
function updateRemoveButton() {
  $("#remove-row").disabled = busy || $("#rows").children.length <= 1;
}
function removeLastRow() {
  if ($("#rows").children.length <= 1) return;
  $("#rows").lastElementChild.remove();
  dirty = true;
  revision++;
  updateRemoveButton();
}
$("#remove-row").onclick = () => {
  if ($("#rows").children.length <= 1) return;
  const filled = [
    ...$("#rows").lastElementChild.querySelectorAll("input"),
  ].some((input) => input.value.trim());
  if (filled) $("#remove-dialog").showModal();
  else removeLastRow();
};
$("#remove-no").onclick = () => $("#remove-dialog").close();
$("#remove-yes").onclick = () => {
  removeLastRow();
  $("#remove-dialog").close();
};
function collect() {
  return {
    schema: "ceramic-summary-form-pwa-v3",
    createdAt,
    savedAt: new Date().toISOString(),
    header: Object.fromEntries(HEADER.map((key) => [key, $(`#${key}`).value])),
    rows: [...$("#rows").children].map((tr) =>
      Object.fromEntries(
        [...tr.querySelectorAll("input")].map((input) => [
          input.dataset.key,
          input.value,
        ]),
      ),
    ),
    remarks: $("#remarks").value,
    sketch: clone(sketch),
  };
}
function showForm() {
  $("#home").hidden = true;
  $("#form-view").hidden = false;
  grow();
  window.scrollTo(0, 0);
  $("#excavationSite").focus();
}
async function preview() {
  const png = await sketchPng(sketch);
  $("#sketch-preview").hidden = !png;
  $("#sketch-placeholder").hidden = Boolean(png);
  $("#sketch-hint").hidden = !png;
  if (png) $("#sketch-preview").src = png;
  else $("#sketch-preview").removeAttribute("src");
  return png;
}
function reset() {
  HTMLFormElement.prototype.reset.call($("#record"));
  $("#rows").replaceChildren();
  row();
  revision++;
  sketch = emptySketch();
  createdAt = new Date().toISOString();
  dirty = false;
  preview();
}
const editor = new SketchEditor($("#sketch-dialog"), (value) => {
  sketch = value;
  dirty = true;
  revision++;
  preview().catch((error) => notify(error.message));
});
$("#open-sketch").onclick = () =>
  editor.open(sketch).catch((error) => notify(error.message));
$("#new").onclick = () => {
  reset();
  showForm();
};
$("#record").onsubmit = (event) => event.preventDefault();
$("#record").addEventListener("input", () => {
  dirty = true;
  revision++;
});
$("#remarks").addEventListener("input", grow);
$("#add-row").onclick = () => {
  if ($("#rows").children.length >= 5000)
    return notify("The limit of 5,000 rows has been reached.");
  row();
  dirty = true;
  revision++;
  $("#rows").lastElementChild.querySelector("input").focus();
};
$("#reset-sheet").onclick = () => $("#reset-dialog").showModal();
$("#reset-no").onclick = () => $("#reset-dialog").close();
$("#reset-yes").onclick = () => {
  reset();
  $("#reset-dialog").close();
  $("#form-view").hidden = true;
  $("#home").hidden = false;
  window.scrollTo(0, 0);
  document.dispatchEvent(new Event("ceramic:home"));
  $("#new").focus();
};
function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to read the file before releasing its object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// Both files use one immutable snapshot and exactly the same filename stem.
$("#export-files").onclick = async () => {
  if (busy) return;
  busy = true;
  const button = $("#export-files");
  button.disabled = true;
  updateRemoveButton();
  $("#reset-sheet").disabled = true;
  button.textContent = "Preparing…";
  const snapshotRevision = revision;
  try {
    const record = collect();
    const stem = filename(record.header);
    record.sketchPng = await sketchPng(record.sketch);
    const doc = await createPdf(record);
    const files = [
      {
        blob: doc.output("blob"),
        name: `${stem}.pdf`,
      },
      {
        blob: new Blob([JSON.stringify(record, null, 2)], {
          type: "application/json",
        }),
        name: `${stem}.json`,
      },
    ];
    if (needsArchive()) {
      downloadFile(await createArchive(files), `${stem}.zip`);
    } else {
      for (const file of files) downloadFile(file.blob, file.name);
    }
    if (revision === snapshotRevision) dirty = false;
  } catch (error) {
    notify(
      "Export failed. Please try again. If the problem persists, reopen the app online.",
    );
  } finally {
    busy = false;
    updateRemoveButton();
    button.disabled = false;
    $("#reset-sheet").disabled = false;
    button.textContent = "Save PDF and JSON";
  }
};
$("#import").onclick = () => $("#json-file").click();
$("#json-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 30000000) throw Error("The file exceeds the 30 MB limit.");
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      throw Error("Invalid or unreadable JSON file.");
    }
    const record = parseRecord(raw);
    // Decode before changing the form, so an invalid image cannot destroy existing input.
    await sketchPng(record.sketch);
    reset();
    HEADER.forEach((key) => ($(`#${key}`).value = record.header[key]));
    $("#remarks").value = record.remarks;
    $("#rows").replaceChildren();
    record.rows.forEach(row);
    sketch = record.sketch;
    createdAt =
      typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString();
    await preview();
    dirty = false;
    showForm();
    notify("Form imported.");
  } catch (error) {
    notify(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
};
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
reset();
$("#new").disabled = false;
$("#import").disabled = false;
window.CeramicAppReady = true;
