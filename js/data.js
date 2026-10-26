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
    throw Error("Invalid JSON field or text too long.");
  return String(value);
}
function image(value) {
  if (!value) return "";
  if (
    typeof value !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ||
    value.length > 20000000
  )
    throw Error("Invalid sketch image.");
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
    throw Error("This file is not a compatible Ceramic form.");
  const header = Object.fromEntries(
    HEADER.map((key) => [key, text(data.header[key], 300)]),
  );
  const rows = data.rows.map((row) => {
    if (!row || typeof row !== "object") throw Error("Invalid row.");
    return Object.fromEntries(
      COLUMNS.map((key) => {
        const value = text(row[key], key === "typeForm" ? 1000 : 12);
        if (key !== "typeForm" && !/^\d*$/.test(value))
          throw Error("Counts must be non-negative whole numbers.");
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
      throw Error("Sketch too large.");
    let pointCount = 0;
    sketch.strokes = data.sketch.strokes.map((stroke) => {
      if (
        !["pen", "eraser"].includes(stroke.tool) ||
        !Number.isFinite(stroke.width) ||
        stroke.width <= 0 ||
        stroke.width > 100 ||
        !Array.isArray(stroke.points)
      )
        throw Error("Invalid stroke.");
      pointCount += stroke.points.length;
      if (pointCount > 1000000) throw Error("Too many points in the sketch.");
      const points = stroke.points.map((point) => {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
        )
          throw Error("Invalid sketch coordinates.");
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

/** Documents contain only JSON values; usable also on older Chromium tablets. */
export const clone = (value) => JSON.parse(JSON.stringify(value));
