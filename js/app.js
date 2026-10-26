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
const $ = (selector) => document.querySelector(selector);
let sketch = emptySketch(),
  dirty = false,
  busy = false;
let revision = 0;
let exportUrls = [];
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
      `${["Type/Form", "Rims", "Handles", "Feet", "Bodies"][index]} – riga ${$("#rows").children.length + 1}`,
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
}
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
  clearExportLinks();
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
    return notify("Limite di 5.000 righe raggiunto.");
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
function clearExportLinks() {
  for (const url of exportUrls) URL.revokeObjectURL(url);
  exportUrls = [];
  $("#export-links").hidden = true;
  for (const selector of ["#download-pdf", "#download-json"])
    $(selector).removeAttribute("href");
}
// Both files use one immutable snapshot and exactly the same filename stem.
$("#export-files").onclick = async () => {
  if (busy) return;
  busy = true;
  const button = $("#export-files");
  button.disabled = true;
  $("#reset-sheet").disabled = true;
  button.textContent = "Preparazione…";
  const snapshotRevision = revision;
  try {
    const record = collect();
    const stem = filename(record.header);
    record.sketchPng = await sketchPng(record.sketch);
    const doc = await createPdf(record, record.sketchPng);
    const files = [
      {
        selector: "#download-pdf",
        blob: doc.output("blob"),
        name: `${stem}.pdf`,
      },
      {
        selector: "#download-json",
        blob: new Blob([JSON.stringify(record, null, 2)], {
          type: "application/json",
        }),
        name: `${stem}.json`,
      },
    ];
    clearExportLinks();
    for (const file of files) {
      const link = $(file.selector);
      link.href = URL.createObjectURL(file.blob);
      exportUrls.push(link.href);
      link.download = file.name;
    }
    // Retain real links: if a browser limits automatic multiple downloads,
    // each generated file remains accessible with an explicit tap.
    $("#export-links").hidden = false;
    for (const file of files) $(file.selector).click();
    if (revision === snapshotRevision) dirty = false;
    notify(
      "PDF e JSON pronti. Puoi riaprirli anche dai collegamenti sotto il pulsante.",
    );
  } catch (error) {
    notify(`Esportazione non riuscita: ${error.message}`);
  } finally {
    busy = false;
    button.disabled = false;
    $("#reset-sheet").disabled = false;
    button.textContent = "Salva PDF ed esporta JSON";
  }
};
$("#import").onclick = () => $("#json-file").click();
$("#json-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 30000000) throw Error("Il file supera il limite di 30 MB.");
    const raw = JSON.parse(await file.text()),
      record = parseRecord(raw);
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
    notify("Scheda importata.");
  } catch (error) {
    notify(`Importazione non riuscita: ${error.message}`);
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
