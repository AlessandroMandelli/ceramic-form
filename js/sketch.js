import { emptySketch, clone } from "./data.js";
import {
  PaperView,
  PAPER_WIDTH as WIDTH,
  PAPER_HEIGHT as HEIGHT,
} from "./sketch-view.js";

/** Drawing data and viewport transforms are deliberately separate. */
export class SketchEditor {
  constructor(dialog, onSave) {
    this.dialog = dialog;
    this.canvas = document.querySelector("#canvas");
    this.area = document.querySelector("#sketch-viewport");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext("2d");
    this.value = emptySketch();
    this.redoStack = [];
    this.baseImage = null;
    this.onSave = onSave;
    this.tool = "pen";
    this.active = null;
    this.pointers = new Map();
    this.view = new PaperView();
    this.area.addEventListener("pointerdown", (event) => this.start(event));
    this.area.addEventListener("pointermove", (event) => this.move(event));
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      this.area.addEventListener(name, (event) => this.end(event));
    this.area.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.view.zoomAt(
            this.view.zoom * Math.exp(-event.deltaY * 0.005),
            this.position(event),
          );
          this.applyView();
        } else if (this.view.zoom > 1) {
          event.preventDefault();
          this.view.pan(-event.deltaX, -event.deltaY);
          this.applyView();
        }
      },
      { passive: false },
    );
    document.querySelector("#pen").onclick = () => this.selectTool("pen");
    document.querySelector("#eraser").onclick = () => this.selectTool("eraser");
    document.querySelector("#pan").onclick = () => this.selectTool("pan");
    document.querySelector("#undo").onclick = () => {
      this.finish();
      if (this.value.strokes.length)
        this.redoStack.push(this.value.strokes.pop());
      this.render();
    };
    document.querySelector("#redo").onclick = () => {
      this.finish();
      if (this.redoStack.length) this.value.strokes.push(this.redoStack.pop());
      this.render();
    };
    document.querySelector("#clear").onclick = () =>
      document.querySelector("#clear-dialog").showModal();
    document.querySelector("#clear-no").onclick = () =>
      document.querySelector("#clear-dialog").close();
    document.querySelector("#clear-yes").onclick = () => {
      this.finish();
      this.value = emptySketch();
      this.baseImage = null;
      this.redoStack = [];
      this.render();
      document.querySelector("#clear-dialog").close();
    };
    document.querySelector("#pen-size").oninput = (event) =>
      (document.querySelector("#pen-value").value = event.target.value);
    document.querySelector("#zoom-in").onclick = () => this.zoomBy(1.25);
    document.querySelector("#zoom-out").onclick = () => this.zoomBy(1 / 1.25);
    document.querySelector("#fit-sketch").onclick = () => {
      this.view.fit();
      this.applyView();
    };
    document.querySelector("#save-sketch").onclick = () => this.save();
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.save();
    });
    if (typeof ResizeObserver !== "undefined")
      new ResizeObserver(() => this.fit()).observe(this.area);
    else window.addEventListener("resize", () => this.fit());
  }
  async open(value) {
    this.value = clone(value);
    this.redoStack = [];
    this.finish();
    this.baseImage = await loadImage(this.value.base);
    this.view = new PaperView();
    this.selectTool("pen");
    this.dialog.showModal();
    this.fit();
    this.render();
  }
  fit() {
    if (!this.dialog.open || !this.area.clientWidth || !this.area.clientHeight)
      return;
    this.view.resize(this.area.clientWidth, this.area.clientHeight);
    this.applyView();
  }
  applyView() {
    const { x, y, scale, zoom } = this.view;
    this.canvas.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    document.querySelector("#zoom-level").value = `${Math.round(zoom * 100)}%`;
    document.querySelector("#zoom-out").disabled = zoom <= 1;
    document.querySelector("#zoom-in").disabled = zoom >= 6;
  }
  zoomBy(factor) {
    this.view.zoomAt(this.view.zoom * factor);
    this.applyView();
  }
  selectTool(tool) {
    this.finish();
    this.tool = tool;
    this.area.dataset.tool = tool;
    for (const [id, value] of [
      ["pen", "pen"],
      ["eraser", "eraser"],
      ["pan", "pan"],
    ])
      document
        .getElementById(id)
        .setAttribute("aria-pressed", String(tool === value));
  }
  position(event) {
    const rect = this.area.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    ];
  }
  touches() {
    return [...this.pointers.values()].filter(
      (pointer) => pointer.type === "touch",
    );
  }
  pinch() {
    const [a, b] = this.touches();
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }
  start(event) {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0 &&
      event.button !== 1
    )
      return;
    // Prefer a stylus over a provisional finger/palm contact.
    if (event.pointerType === "pen" && this.active?.type === "touch") {
      if (
        this.value.strokes[this.value.strokes.length - 1] === this.active.stroke
      )
        this.value.strokes.pop();
      this.redoStack = this.active.redoBefore;
      this.finish();
      this.render();
    }
    // Ignore fingers/palm while the stylus is drawing.
    if (this.active?.type === "pen" && event.pointerType === "touch") return;
    event.preventDefault();
    this.area.setPointerCapture?.(event.pointerId);
    const position = this.position(event);
    this.pointers.set(event.pointerId, {
      ...position,
      type: event.pointerType,
    });
    if (this.touches().length >= 2) {
      // The first touch may have started a provisional stroke: a two-finger
      // gesture must not leave an accidental mark or destroy the redo stack.
      if (this.active?.type === "touch") {
        if (
          this.value.strokes[this.value.strokes.length - 1] ===
          this.active.stroke
        )
          this.value.strokes.pop();
        this.redoStack = this.active.redoBefore;
        this.active = null;
        this.render();
      }
      this.pan = null;
      this.gesture = this.pinch();
      return;
    }
    if (this.active) return;
    if (
      this.tool === "pan" ||
      event.button === 1 ||
      event.target !== this.canvas
    ) {
      this.pan = { id: event.pointerId, position };
      return;
    }
    this.active = {
      id: event.pointerId,
      type: event.pointerType,
      redoBefore: [...this.redoStack],
      stroke: {
        tool: this.tool,
        width:
          Number(document.querySelector("#pen-size").value) *
          (this.tool === "eraser" ? 6 : 1),
        points: [this.point(event)],
      },
    };
    this.value.strokes.push(this.active.stroke);
    this.redoStack = [];
    this.render();
  }
  move(event) {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    const position = this.position(event);
    this.pointers.set(event.pointerId, {
      ...position,
      type: event.pointerType,
    });
    if (this.gesture && this.touches().length >= 2) {
      const next = this.pinch();
      this.view.zoomAt(
        (this.view.zoom * next.distance) / this.gesture.distance,
        this.gesture.center,
      );
      this.view.pan(
        next.center.x - this.gesture.center.x,
        next.center.y - this.gesture.center.y,
      );
      this.gesture = next;
      this.applyView();
      return;
    }
    if (this.pan?.id === event.pointerId) {
      this.view.pan(
        position.x - this.pan.position.x,
        position.y - this.pan.position.y,
      );
      this.pan.position = position;
      this.applyView();
      return;
    }
    if (this.active?.id !== event.pointerId) return;
    const events = event.getCoalescedEvents?.();
    for (const pointEvent of events?.length ? events : [event])
      this.active.stroke.points.push(this.point(pointEvent));
    this.render();
  }
  end(event) {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    if (this.active?.id === event.pointerId) this.active = null;
    if (this.pan?.id === event.pointerId) this.pan = null;
    if (this.gesture && this.touches().length < 2) {
      this.gesture = null;
      const entry = [...this.pointers.entries()].find(
        ([, pointer]) => pointer.type === "touch",
      );
      if (entry) this.pan = { id: entry[0], position: entry[1] };
    }
  }
  finish() {
    this.active = null;
    this.pan = null;
    this.gesture = null;
    this.pointers.clear();
  }
  render() {
    draw(this.ctx, this.value, this.baseImage);
    document.querySelector("#undo").disabled = !this.value.strokes.length;
    document.querySelector("#redo").disabled = !this.redoStack.length;
  }
  save() {
    this.finish();
    this.onSave(clone(this.value));
    this.dialog.close();
  }
}
export function loadImage(source) {
  if (!source) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error("Impossibile leggere lo schizzo."));
    image.src = source;
  });
}
function draw(ctx, value, base) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  if (base) {
    const scale = Math.min(width / base.width, height / base.height);
    ctx.drawImage(
      base,
      (width - base.width * scale) / 2,
      (height - base.height * scale) / 2,
      base.width * scale,
      base.height * scale,
    );
  }
  for (const stroke of value.strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = ctx.fillStyle =
      stroke.tool === "eraser" ? "#fff" : "#202820";
    ctx.lineWidth = (stroke.width * width) / WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const [x, y] = stroke.points[0];
    ctx.beginPath();
    ctx.moveTo(x * width, y * height);
    for (const [px, py] of stroke.points.slice(1))
      ctx.lineTo(px * width, py * height);
    if (stroke.points.length === 1) {
      ctx.arc(x * width, y * height, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.stroke();
  }
}
export async function sketchPng(value) {
  if (!value.base && !value.strokes.length) return "";
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  draw(canvas.getContext("2d"), value, await loadImage(value.base));
  return canvas.toDataURL("image/png");
}
