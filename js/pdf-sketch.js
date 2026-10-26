import { PAPER_WIDTH } from "./sketch-view.js";

/** Paint the saved stroke model directly as PDF paths, without tracing a PNG.
 * Eraser strokes remain opaque white paths, matching the canvas paint order.
 * A legacy bitmap, when present, is the only raster component of this sheet.
 */
export function drawPdfSketch(doc, sketch, x, y, width, height) {
  doc.saveGraphicsState();
  try {
    doc.rect(x, y, width, height, null);
    doc.clip();
    doc.discardPath();
    if (sketch.base) {
      const image = doc.getImageProperties(sketch.base);
      const scale = Math.min(width / image.width, height / image.height);
      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;
      doc.addImage(
        sketch.base,
        "PNG",
        x + (width - imageWidth) / 2,
        y + (height - imageHeight) / 2,
        imageWidth,
        imageHeight,
        undefined,
        "FAST",
      );
    }
    doc.setLineCap("round");
    doc.setLineJoin("round");
    for (const stroke of sketch.strokes) {
      if (!stroke.points.length) continue;
      const color = stroke.tool === "eraser" ? [255, 255, 255] : [32, 40, 32];
      doc.setDrawColor(...color);
      doc.setFillColor(...color);
      const thickness = (stroke.width * width) / PAPER_WIDTH;
      doc.setLineWidth(thickness);
      const [firstX, firstY] = stroke.points[0];
      const startX = x + firstX * width;
      const startY = y + firstY * height;
      if (stroke.points.length === 1) {
        doc.circle(startX, startY, thickness / 2, "F");
      } else {
        doc.moveTo(startX, startY);
        for (let i = 1; i < stroke.points.length; i++) {
          const [px, py] = stroke.points[i];
          doc.lineTo(x + px * width, y + py * height);
        }
        doc.stroke();
      }
    }
  } finally {
    doc.restoreGraphicsState();
  }
}
