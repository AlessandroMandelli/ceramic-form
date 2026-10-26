import test from "node:test";
import assert from "node:assert/strict";
import {
  PaperView,
  PAPER_WIDTH,
  PAPER_HEIGHT,
  PAPER_MARGIN,
} from "../js/sketch-view.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("fit leaves a visible margin on every side of the sheet", () => {
  const view = new PaperView();
  view.resize(1000, 700);
  assert.ok(view.x >= PAPER_MARGIN);
  assert.ok(view.y >= PAPER_MARGIN);
  assert.ok(1000 - view.x - PAPER_WIDTH * view.scale >= PAPER_MARGIN - 0.0001);
  assert.ok(700 - view.y - PAPER_HEIGHT * view.scale >= PAPER_MARGIN - 0.0001);
});
test("zoom keeps the chosen drawing point under the same screen position", () => {
  const view = new PaperView();
  view.resize(1000, 700);
  const before = view.point(300, 200);
  view.zoomAt(2, { x: 300, y: 200 });
  const after = view.point(300, 200);
  near(before[0], after[0]);
  near(before[1], after[1]);
});
test("panning cannot lose the sheet and fit restores the original bounds", () => {
  const view = new PaperView();
  view.resize(1000, 700);
  const original = [view.x, view.y, view.scale];
  view.zoomAt(4);
  view.pan(99999, -99999);
  assert.ok(view.x <= PAPER_MARGIN);
  assert.ok(view.y >= 700 - PAPER_MARGIN - PAPER_HEIGHT * view.scale);
  view.fit();
  assert.deepEqual([view.x, view.y, view.scale], original);
});
test("resize preserves the drawing point at the center while zoomed", () => {
  const view = new PaperView();
  view.resize(1000, 700);
  view.zoomAt(3);
  const before = view.point(500, 350);
  view.resize(700, 1000);
  const after = view.point(350, 500);
  near(before[0], after[0]);
  near(before[1], after[1]);
});
