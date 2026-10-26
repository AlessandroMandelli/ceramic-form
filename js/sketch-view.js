/** Viewport geometry is independent of the drawing and is never exported. */
export const PAPER_WIDTH = 1200;
export const PAPER_HEIGHT = 900;
export const PAPER_MARGIN = 24;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export class PaperView {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.zoom = 1;
    this.scale = 1;
    this.x = 0;
    this.y = 0;
  }
  resize(width, height) {
    const oldScale = this.scale;
    const centerX = (this.width / 2 - this.x) / oldScale;
    const centerY = (this.height / 2 - this.y) / oldScale;
    const wasReady = this.width > 0 && this.height > 0;
    this.width = width;
    this.height = height;
    this.fitScale = Math.max(
      0.001,
      Math.min(
        Math.max(1, width - 2 * PAPER_MARGIN) / PAPER_WIDTH,
        Math.max(1, height - 2 * PAPER_MARGIN) / PAPER_HEIGHT,
      ),
    );
    this.scale = this.fitScale * this.zoom;
    if (wasReady && this.zoom > 1) {
      this.x = width / 2 - centerX * this.scale;
      this.y = height / 2 - centerY * this.scale;
    } else this.center();
    this.constrain();
  }
  center() {
    this.x = (this.width - PAPER_WIDTH * this.scale) / 2;
    this.y = (this.height - PAPER_HEIGHT * this.scale) / 2;
  }
  fit() {
    this.zoom = 1;
    this.scale = this.fitScale || 1;
    this.center();
    this.constrain();
  }
  zoomAt(value, anchor = { x: this.width / 2, y: this.height / 2 }) {
    const oldScale = this.scale;
    this.zoom = clamp(value, 1, 6);
    this.scale = (this.fitScale || 1) * this.zoom;
    this.x = anchor.x - ((anchor.x - this.x) * this.scale) / oldScale;
    this.y = anchor.y - ((anchor.y - this.y) * this.scale) / oldScale;
    this.constrain();
  }
  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.constrain();
  }
  constrain() {
    const bound = (offset, viewport, paper) =>
      paper <= viewport - 2 * PAPER_MARGIN
        ? (viewport - paper) / 2
        : clamp(offset, viewport - PAPER_MARGIN - paper, PAPER_MARGIN);
    this.x = bound(this.x, this.width, PAPER_WIDTH * this.scale);
    this.y = bound(this.y, this.height, PAPER_HEIGHT * this.scale);
  }
  point(x, y) {
    return [
      (x - this.x) / (PAPER_WIDTH * this.scale),
      (y - this.y) / (PAPER_HEIGHT * this.scale),
    ];
  }
}
