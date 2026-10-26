import { COLUMNS, filledRows } from "./data.js";
let fonts;
async function fontData() {
  if (!fonts)
    fonts = Promise.all(
      ["DejaVuSans", "DejaVuSans-Bold"].map(async (name) => {
        const response = await fetch(`./assets/${name}.ttf`);
        if (!response.ok)
          throw Error(
            "Font PDF non disponibile. Riprova dopo un caricamento online.",
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
export async function createPdf(record, png) {
  if (!window.jspdf)
    throw Error("Motore PDF non disponibile. Ricarica l’app online.");
  const doc = new window.jspdf.jsPDF({
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const data = await fontData();
  ["normal", "bold"].forEach((style, index) => {
    const name = `DejaVu-${style}.ttf`;
    doc.addFileToVFS(name, data[index]);
    doc.addFont(name, "DejaVu", style);
  });
  const left = 10,
    right = 200,
    split = 94,
    bottom = 281,
    widths = [30, 13, 16, 12, 13];
  const line = (x, y, x2, y2) => doc.line(x, y, x2, y2);
  const text = (s, x, y, bold = false, size = 9) => {
    doc.setFont("DejaVu", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(s, x, y);
  };
  const wrap = (s, w, size = 9) => {
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(String(s), w);
  };
  let tableY, notesY, top;
  function header(continuation = false) {
    doc.setLineWidth(0.2);
    doc.setDrawColor(0);
    doc.setTextColor(0);
    const site = wrap(`Excavation site: ${record.header.excavationSite}`, 82);
    const h = Math.max(12, site.length * 4.3 + 5);
    doc.rect(left, 10, 190, h);
    line(112, 10, 112, 10 + h);
    text("Ceramic - Summary form", 13, 17, true, 11);
    text(site, 115, 16, false, 9);
    const labels = [
      ["Area", record.header.area],
      ["Strat. Unit", record.header.stratUnit],
      ["Room", record.header.room],
    ];
    const metadata = labels.map(([key, value]) => wrap(`${key}: ${value}`, 58));
    const mh = Math.max(11, ...metadata.map((t) => t.length * 4.3 + 5));
    doc.rect(left, 10 + h, 190, mh);
    metadata.forEach((t, i) => text(t, 13 + i * 63, 16 + h));
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
      text(label, x + 1.2, top + 12, true, 7.5);
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
  let rowIndex = 0,
    noteIndex = 0,
    sketchPending = Boolean(png),
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
        text(lines.splice(0, count), x + 1.5, tableY + 4.3, false, 8.5);
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
        sketchPending = false;
      }
    }
    text(String(page), 195, 289, false, 8);
    page++;
  } while (
    rowIndex < rowQueue.length ||
    noteIndex < notes.length ||
    sketchPending
  );
  doc.setProperties({
    title: "Ceramic - Summary form",
    subject: record.header.excavationSite,
    creator: "Ceramic PWA",
  });
  return doc;
}
