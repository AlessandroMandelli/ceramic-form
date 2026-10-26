import { emptySketch, clone } from "./data.js";
const WIDTH = 1200,
  HEIGHT = 900;
/** Fixed logical sheet, normalized points: resizing never changes the drawing. */
export class SketchEditor {
  constructor(dialog, onSave) {
    this.dialog = dialog;
    this.canvas = document.querySelector("#canvas");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext("2d");
    this.value = emptySketch();
    this.redoStack = [];
    this.baseImage = null;
    this.onSave = onSave;
    this.tool = "pen";
    this.active = null;
    this.canvas.addEventListener("pointerdown", (event) => this.start(event));
    this.canvas.addEventListener("pointermove", (event) => this.move(event));
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      this.canvas.addEventListener(name, () => this.finish());
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
    document.querySelector("#eraser").onclick = (event) => {
      this.tool = this.tool === "pen" ? "eraser" : "pen";
      event.currentTarget.setAttribute("aria-pressed", this.tool === "eraser");
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
    document.querySelector("#save-sketch").onclick = () => this.save();
    // Escape/back closes the editor by committing the same way as the save button.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.save();
    });
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.fit()).observe(
        document.querySelector(".canvas-area"),
      );
    } else window.addEventListener("resize", () => this.fit());
  }
  async open(value) {
    this.value = clone(value);
    this.redoStack = [];
    this.active = null;
    this.baseImage = await loadImage(this.value.base);
    this.dialog.showModal();
    this.fit();
    this.render();
  }
  fit() {
    const area = this.canvas.parentElement;
    const scale = Math.min(
      area.clientWidth / WIDTH,
      area.clientHeight / HEIGHT,
    );
    this.canvas.style.width = `${WIDTH * scale}px`;
    this.canvas.style.height = `${HEIGHT * scale}px`;
  }
  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    ];
  }
  start(event) {
    if (this.active || (event.pointerType === "mouse" && event.button !== 0))
      return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.active = {
      id: event.pointerId,
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
    if (!this.active || this.active.id !== event.pointerId) return;
    event.preventDefault();
    const events = event.getCoalescedEvents?.();
    for (const pointEvent of events?.length ? events : [event])
      this.active.stroke.points.push(this.point(pointEvent));
    this.render();
  }
  finish() {
    this.active = null;
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
