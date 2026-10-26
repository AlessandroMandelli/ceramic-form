/** Portable, versioned document format. No browser state is stored implicitly. */
export const COLUMNS = ["typeForm", "rims", "handles", "feet", "bodies"];
export const HEADER = ["excavationSite", "area", "stratUnit", "room"];
export const emptyRow = () =>
  Object.fromEntries(COLUMNS.map((key) => [key, ""]));
export const filledRows = (rows) =>
  rows.filter((row) =>
    COLUMNS.some((key) => String(row[key] ?? "").trim() !== ""),
  );
export const emptySketch = () => ({ base: "", strokes: [] });
export function filename(header, now = new Date()) {
  const safe = (value) =>
    String(value)
      .trim()
      .normalize("NFC")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 44) || "NA";
  const pad = (value) => String(value).padStart(2, "0");
  return [
    ...HEADER.map((key) => safe(header[key] || "")),
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("_");
}
function text(value, limit = 100000) {
  if (value == null) return "";
  if (
    !["string", "number"].includes(typeof value) ||
    String(value).length > limit
  )
    throw Error("Campo JSON non valido o troppo lungo.");
  return String(value);
}
function image(value) {
  if (!value) return "";
  if (
    typeof value !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ||
    value.length > 20000000
  )
    throw Error("Immagine dello schizzo non valida.");
  return value;
}
export function parseRecord(data) {
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.rows) ||
    !data.header ||
    data.rows.length > 5000
  )
    throw Error("Il file non è una scheda Ceramic compatibile.");
  const header = Object.fromEntries(
    HEADER.map((key) => [key, text(data.header[key], 300)]),
  );
  const rows = data.rows.map((row) => {
    if (!row || typeof row !== "object") throw Error("Riga non valida.");
    return Object.fromEntries(
      COLUMNS.map((key) => {
        const value = text(row[key], key === "typeForm" ? 1000 : 12);
        if (key !== "typeForm" && !/^\d*$/.test(value))
          throw Error("I conteggi devono essere numeri interi non negativi.");
        return [key, value];
      }),
    );
  });
  let sketch = emptySketch();
  if (data.schema === "ceramic-summary-form-pwa-v3" && data.sketch) {
    sketch.base = image(data.sketch.base);
    if (
      !Array.isArray(data.sketch.strokes) ||
      data.sketch.strokes.length > 30000
    )
      throw Error("Schizzo troppo grande.");
    let pointCount = 0;
    sketch.strokes = data.sketch.strokes.map((stroke) => {
      if (
        !["pen", "eraser"].includes(stroke.tool) ||
        !Number.isFinite(stroke.width) ||
        stroke.width <= 0 ||
        stroke.width > 100 ||
        !Array.isArray(stroke.points)
      )
        throw Error("Tratto non valido.");
      pointCount += stroke.points.length;
      if (pointCount > 1000000) throw Error("Troppi punti nello schizzo.");
      const points = stroke.points.map((point) => {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
        )
          throw Error("Coordinate dello schizzo non valide.");
        return [...point];
      });
      return { tool: stroke.tool, width: stroke.width, points };
    });
  } else sketch.base = image(data.sketchPng); // Legacy v2: preserve pixels without guessing its stroke coordinates.
  return {
    header,
    rows: rows.length ? rows : [emptyRow()],
    remarks: text(data.remarks),
    sketch,
  };
}
