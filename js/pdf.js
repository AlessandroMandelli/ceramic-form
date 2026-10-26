import { COLUMNS, filledRows } from "./data.js";
import { drawPdfSketch } from "./pdf-sketch.js";
let fonts;
let engine;
function loadEngine() {
  if (window.jspdf) return Promise.resolve();
  if (!engine)
    engine = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./vendor/jspdf.umd.min.js";
      script.onload = () =>
        window.jspdf ? resolve() : reject(Error("PDF engine not initialized."));
      script.onerror = () => {
        script.remove();
        reject(Error("PDF engine unavailable. Reopen the app online."));
      };
      document.head.append(script);
    }).catch((error) => {
      engine = null;
      throw error;
    });
  return engine;
}
async function fontData() {
  if (!fonts)
    fonts = Promise.all(
      ["LiberationSans-Regular", "LiberationSans-Bold"].map(async (name) => {
        const response = await fetch(`./assets/${name}.ttf`);
        if (!response.ok)
          throw Error(
            "PDF font unavailable. Reopen the app online and try again.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      }),
    ).catch((error) => {
      fonts = null;
      throw error;
    });
  return fonts;
}
/** Replace this renderer when the final PDF template is supplied. All units are mm. */
export async function createPdf(record, png = record.sketchPng || "") {
  await loadEngine();
  const doc = new window.jspdf.jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const data = await fontData();
  ["normal", "bold"].forEach((style, index) => {
    const name = `Liberation-${style}.ttf`;
    doc.addFileToVFS(name, data[index]);
    doc.addFont(name, "Liberation", style);
  });
  const left = 10,
    right = 200,
    split = 94,
    bottom = 281,
    widths = [30, 13, 16, 12, 13];
  const line = (x, y, x2, y2) => doc.line(x, y, x2, y2);
  const text = (s, x, y, bold = false, size = 9) => {
    doc.setFont("Liberation", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(s, x, y);
  };
  const wrap = (s, w, size = 9) => {
    doc.setFont("Liberation", "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(String(s), w);
  };
  // Measure bold labels independently; values stay regular, including wrapped lines.
  function labelLines(label, value, width) {
    const prefix = `${label}:`;
    text("", 0, 0, true);
    const prefixWidth = doc.getTextWidth(prefix + " ");
    text("", 0, 0, false);
    const lines = [{ label: prefix, value: "", indent: prefixWidth }];
    for (const character of String(value ?? "")) {
      let last = lines[lines.length - 1];
      if (character === "\n") {
        lines.push({ label: "", value: "", indent: 0 });
        continue;
      }
      if (doc.getTextWidth(last.value + character) + last.indent > width) {
        last = { label: "", value: "", indent: 0 };
        lines.push(last);
      }
      last.value += character;
    }
    return lines;
  }
  function drawLabel(lines, x, y) {
    lines.forEach((entry, index) => {
      const baseline = y + index * 4.3;
      if (entry.label) text(entry.label, x, baseline, true);
      if (entry.value) text(entry.value, x + entry.indent, baseline);
    });
  }
  let tableY, notesY, top;
  function header(continuation = false) {
    doc.setLineWidth(0.2);
    doc.setDrawColor(0);
    doc.setTextColor(0);
    const site = labelLines(
      "Excavation site",
      record.header.excavationSite,
      82,
    );
    const h = Math.max(12, site.length * 4.3 + 5);
    doc.rect(left, 10, 190, h);
    line(112, 10, 112, 10 + h);
    text("Ceramic - Summary form", 13, 17, true, 11);
    drawLabel(site, 115, 16);
    const labels = [
      ["Area", record.header.area],
      ["Stratigraphic unit", record.header.stratUnit],
      ["Room", record.header.room],
    ];
    const metadata = labels.map(([key, value]) => labelLines(key, value, 58));
    const mh = Math.max(11, ...metadata.map((lines) => lines.length * 4.3 + 5));
    doc.rect(left, 10 + h, 190, mh);
    metadata.forEach((lines, i) => drawLabel(lines, 13 + i * 63, 16 + h));
    top = 10 + h + mh;
    tableY = top + 15;
    notesY = top + 7;
    text(
      continuation ? "Fragments (continued)" : "Fragments",
      13,
      top + 5,
      true,
    );
    doc.rect(left, top, split - left, 7);
    let x = left;
    ["Type/Form", "Rims", "Handles", "Feet", "Bodies"].forEach((label, i) => {
      doc.rect(x, top + 7, widths[i], 8);
      if (i === 0) text(label, x + 1.2, top + 12, true, 7.5);
      else {
        doc.setFont("Liberation", "bold");
        doc.setFontSize(7.5);
        doc.text(label, x + widths[i] / 2, top + 11, {
          align: "center",
          baseline: "middle",
        });
      }
      x += widths[i];
    });
    text("Fabric and remarks", split + 3, top + 5, true);
    line(split, top, split, bottom);
    line(right, top, right, bottom);
    line(split, top, right, top);
    line(left, bottom, right, bottom);
    line(left, tableY, left, bottom);
  }
  header();
  const rows = filledRows(record.rows);
  // Table, notes and sketch flow independently; subsequent pages repeat the record header.
  const rowQueue = rows.map((row) =>
    COLUMNS.map((key, i) => wrap(row[key], widths[i] - 3, 8.5)),
  );
  const notes = wrap(record.remarks, right - split - 6, 9);
  const sketchModel =
    record.sketch && Array.isArray(record.sketch.strokes)
      ? record.sketch
      : null;
  const hasSketch = sketchModel
    ? Boolean(
        sketchModel.base ||
          sketchModel.strokes.some((stroke) => stroke.points.length),
      )
    : Boolean(png);
  let rowIndex = 0,
    noteIndex = 0,
    sketchPending = hasSketch,
    page = 1;
  do {
    if (page > 1) {
      doc.addPage();
      header(true);
    }
    while (rowIndex < rowQueue.length && tableY + 7 < bottom) {
      const cells = rowQueue[rowIndex];
      const room = Math.max(1, Math.floor((bottom - tableY - 3) / 4));
      const count = Math.min(room, Math.max(...cells.map((c) => c.length), 1));
      const height = count * 4 + 3;
      let x = left;
      cells.forEach((lines, i) => {
        doc.rect(x, tableY, widths[i], height);
        const content = lines.splice(0, count);
        if (i === 0) {
          if (content.length) text(content, x + 1.5, tableY + 4.3, false, 8.5);
        } else {
          doc.setFont("Liberation", "normal");
          doc.setFontSize(8.5);
          content.forEach((value, index) =>
            doc.text(
              value,
              x + widths[i] / 2,
              tableY + height / 2 + (index - (content.length - 1) / 2) * 4,
              { align: "center", baseline: "middle" },
            ),
          );
        }
        x += widths[i];
      });
      tableY += height;
      if (cells.every((c) => !c.length)) rowIndex++;
      else break;
    }
    // Leave white space around the remarks and preserve explicit newlines.
    while (noteIndex < notes.length && notesY + 5 < bottom) {
      text(notes[noteIndex++], split + 3, notesY + 4, false, 9);
      notesY += 4.5;
    }
    if (noteIndex >= notes.length && sketchPending) {
      const sketchHeight = (right - split - 8) * 0.75;
      if (notesY + sketchHeight + 12 <= bottom) {
        line(split, notesY + 7, right, notesY + 7);
        if (sketchModel) {
          drawPdfSketch(
            doc,
            sketchModel,
            split + 4,
            notesY + 11,
            right - split - 8,
            sketchHeight,
          );
        } else {
          // Compatibility for callers that only have a flattened legacy image.
          doc.addImage(
            png,
            "PNG",
            split + 4,
            notesY + 11,
            right - split - 8,
            sketchHeight,
            undefined,
            "FAST",
          );
        }
        sketchPending = false;
      }
    }

    page++;
  } while (
    rowIndex < rowQueue.length ||
    noteIndex < notes.length ||
    sketchPending
  );
  const totalPages = doc.getNumberOfPages();
  for (let number = 1; number <= totalPages; number++) {
    doc.setPage(number);
    doc.setFont("Liberation", "normal");
    doc.setFontSize(8);
    doc.text(`${number}/${totalPages}`, 200, 289, { align: "right" });
  }
  doc.setProperties({
    title: "Ceramic - Summary form",
    subject: record.header.excavationSite,
    creator: "Ceramic PWA",
  });
  return doc;
}
