(() => {
  // js/data.js
  var COLUMNS = ["typeForm", "rims", "handles", "feet", "bodies"];
  var HEADER = ["excavationSite", "area", "stratUnit", "room"];
  var emptyRow = () => Object.fromEntries(COLUMNS.map((key) => [key, ""]));
  var filledRows = (rows) => rows.filter(
    (row2) => COLUMNS.some((key) => String(row2[key] ?? "").trim() !== "")
  );
  var emptySketch = () => ({ base: "", strokes: [] });
  function filename(header, now = /* @__PURE__ */ new Date()) {
    const safe = (value) => String(value).trim().normalize("NFC").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, "-").replace(/[. ]+$/g, "").slice(0, 44) || "NA";
    const pad = (value) => String(value).padStart(2, "0");
    return [
      ...HEADER.map((key) => safe(header[key] || "")),
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      pad(now.getHours()),
      pad(now.getMinutes())
    ].join("_");
  }
  function text(value, limit = 1e5) {
    if (value == null) return "";
    if (!["string", "number"].includes(typeof value) || String(value).length > limit)
      throw Error("Invalid JSON field or text too long.");
    return String(value);
  }
  function image(value) {
    if (!value) return "";
    if (typeof value !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 2e7)
      throw Error("Invalid sketch image.");
    return value;
  }
  function parseRecord(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.rows) || !data.header || data.rows.length > 5e3)
      throw Error("This file is not a compatible Ceramic form.");
    const header = Object.fromEntries(
      HEADER.map((key) => [key, text(data.header[key], 300)])
    );
    const rows = data.rows.map((row2) => {
      if (!row2 || typeof row2 !== "object") throw Error("Invalid row.");
      return Object.fromEntries(
        COLUMNS.map((key) => {
          const value = text(row2[key], key === "typeForm" ? 1e3 : 12);
          if (key !== "typeForm" && !/^\d*$/.test(value))
            throw Error("Counts must be non-negative whole numbers.");
          return [key, value];
        })
      );
    });
    let sketch2 = emptySketch();
    if (data.schema === "ceramic-summary-form-pwa-v3" && data.sketch) {
      sketch2.base = image(data.sketch.base);
      if (!Array.isArray(data.sketch.strokes) || data.sketch.strokes.length > 3e4)
        throw Error("Sketch too large.");
      let pointCount = 0;
      sketch2.strokes = data.sketch.strokes.map((stroke) => {
        if (!["pen", "eraser"].includes(stroke.tool) || !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 100 || !Array.isArray(stroke.points))
          throw Error("Invalid stroke.");
        pointCount += stroke.points.length;
        if (pointCount > 1e6) throw Error("Too many points in the sketch.");
        const points = stroke.points.map((point) => {
          if (!Array.isArray(point) || point.length !== 2 || point.some((n) => !Number.isFinite(n) || n < 0 || n > 1))
            throw Error("Invalid sketch coordinates.");
          return [...point];
        });
        return { tool: stroke.tool, width: stroke.width, points };
      });
    } else sketch2.base = image(data.sketchPng);
    return {
      header,
      rows: rows.length ? rows : [emptyRow()],
      remarks: text(data.remarks),
      sketch: sketch2
    };
  }
  var clone = (value) => JSON.parse(JSON.stringify(value));

  // js/sketch-view.js
  var PAPER_WIDTH = 1200;
  var PAPER_HEIGHT = 900;
  var PAPER_MARGIN = 24;
  var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  var PaperView = class {
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
        1e-3,
        Math.min(
          Math.max(1, width - 2 * PAPER_MARGIN) / PAPER_WIDTH,
          Math.max(1, height - 2 * PAPER_MARGIN) / PAPER_HEIGHT
        )
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
      this.x = anchor.x - (anchor.x - this.x) * this.scale / oldScale;
      this.y = anchor.y - (anchor.y - this.y) * this.scale / oldScale;
      this.constrain();
    }
    pan(dx, dy) {
      this.x += dx;
      this.y += dy;
      this.constrain();
    }
    constrain() {
      const bound = (offset, viewport, paper) => paper <= viewport - 2 * PAPER_MARGIN ? (viewport - paper) / 2 : clamp(offset, viewport - PAPER_MARGIN - paper, PAPER_MARGIN);
      this.x = bound(this.x, this.width, PAPER_WIDTH * this.scale);
      this.y = bound(this.y, this.height, PAPER_HEIGHT * this.scale);
    }
    point(x, y) {
      return [
        (x - this.x) / (PAPER_WIDTH * this.scale),
        (y - this.y) / (PAPER_HEIGHT * this.scale)
      ];
    }
  };

  // js/sketch.js
  var SketchEditor = class {
    constructor(dialog, onSave) {
      this.dialog = dialog;
      this.canvas = document.querySelector("#canvas");
      this.area = document.querySelector("#sketch-viewport");
      this.canvas.width = PAPER_WIDTH;
      this.canvas.height = PAPER_HEIGHT;
      this.ctx = this.canvas.getContext("2d");
      this.value = emptySketch();
      this.redoStack = [];
      this.baseImage = null;
      this.onSave = onSave;
      this.tool = "pen";
      this.active = null;
      this.pointers = /* @__PURE__ */ new Map();
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
              this.view.zoom * Math.exp(-event.deltaY * 5e-3),
              this.position(event)
            );
            this.applyView();
          } else if (this.view.zoom > 1) {
            event.preventDefault();
            this.view.pan(-event.deltaX, -event.deltaY);
            this.applyView();
          }
        },
        { passive: false }
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
      document.querySelector("#clear").onclick = () => document.querySelector("#clear-dialog").showModal();
      document.querySelector("#clear-no").onclick = () => document.querySelector("#clear-dialog").close();
      document.querySelector("#clear-yes").onclick = () => {
        this.finish();
        this.value = emptySketch();
        this.baseImage = null;
        this.redoStack = [];
        this.render();
        document.querySelector("#clear-dialog").close();
      };
      document.querySelector("#pen-size").oninput = (event) => document.querySelector("#pen-value").value = event.target.value;
      document.querySelector("#zoom-in").onclick = () => this.zoomBy(1.25);
      document.querySelector("#zoom-out").onclick = () => this.zoomBy(1 / 1.25);
      document.querySelector("#fit-sketch").onclick = () => {
        this.view.fit();
        this.applyView();
      };
      document.querySelector("#save-sketch").onclick = () => this.save();
      document.querySelector("#back-sketch").onclick = () => this.save();
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
        ["pan", "pan"]
      ])
        document.getElementById(id).setAttribute("aria-pressed", String(tool === value));
    }
    position(event) {
      const rect = this.area.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    point(event) {
      const rect = this.canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      ];
    }
    touches() {
      return [...this.pointers.values()].filter(
        (pointer) => pointer.type === "touch"
      );
    }
    pinch() {
      const [a, b] = this.touches();
      return {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      };
    }
    start(event) {
      var _a, _b, _c, _d, _e;
      if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1)
        return;
      if (event.pointerType === "pen" && ((_a = this.active) == null ? void 0 : _a.type) === "touch") {
        if (this.value.strokes[this.value.strokes.length - 1] === this.active.stroke)
          this.value.strokes.pop();
        this.redoStack = this.active.redoBefore;
        this.finish();
        this.render();
      }
      if (((_b = this.active) == null ? void 0 : _b.type) === "pen" && event.pointerType === "touch") return;
      event.preventDefault();
      (_d = (_c = this.area).setPointerCapture) == null ? void 0 : _d.call(_c, event.pointerId);
      const position = this.position(event);
      this.pointers.set(event.pointerId, {
        ...position,
        type: event.pointerType
      });
      if (this.touches().length >= 2) {
        if (((_e = this.active) == null ? void 0 : _e.type) === "touch") {
          if (this.value.strokes[this.value.strokes.length - 1] === this.active.stroke)
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
      if (this.tool === "pan" || event.button === 1 || event.target !== this.canvas) {
        this.pan = { id: event.pointerId, position };
        return;
      }
      this.active = {
        id: event.pointerId,
        type: event.pointerType,
        redoBefore: [...this.redoStack],
        stroke: {
          tool: this.tool,
          width: Number(document.querySelector("#pen-size").value) * (this.tool === "eraser" ? 6 : 1),
          points: [this.point(event)]
        }
      };
      this.value.strokes.push(this.active.stroke);
      this.redoStack = [];
      this.render();
    }
    move(event) {
      var _a, _b, _c;
      if (!this.pointers.has(event.pointerId)) return;
      event.preventDefault();
      const position = this.position(event);
      this.pointers.set(event.pointerId, {
        ...position,
        type: event.pointerType
      });
      if (this.gesture && this.touches().length >= 2) {
        const next = this.pinch();
        this.view.zoomAt(
          this.view.zoom * next.distance / this.gesture.distance,
          this.gesture.center
        );
        this.view.pan(
          next.center.x - this.gesture.center.x,
          next.center.y - this.gesture.center.y
        );
        this.gesture = next;
        this.applyView();
        return;
      }
      if (((_a = this.pan) == null ? void 0 : _a.id) === event.pointerId) {
        this.view.pan(
          position.x - this.pan.position.x,
          position.y - this.pan.position.y
        );
        this.pan.position = position;
        this.applyView();
        return;
      }
      if (((_b = this.active) == null ? void 0 : _b.id) !== event.pointerId) return;
      const events = (_c = event.getCoalescedEvents) == null ? void 0 : _c.call(event);
      for (const pointEvent of (events == null ? void 0 : events.length) ? events : [event])
        this.active.stroke.points.push(this.point(pointEvent));
      this.render();
    }
    end(event) {
      var _a, _b;
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.delete(event.pointerId);
      if (((_a = this.active) == null ? void 0 : _a.id) === event.pointerId) this.active = null;
      if (((_b = this.pan) == null ? void 0 : _b.id) === event.pointerId) this.pan = null;
      if (this.gesture && this.touches().length < 2) {
        this.gesture = null;
        const entry = [...this.pointers.entries()].find(
          ([, pointer]) => pointer.type === "touch"
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
  };
  function loadImage(source) {
    if (!source) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const image2 = new Image();
      image2.onload = () => resolve(image2);
      image2.onerror = () => reject(Error("Unable to read the sketch."));
      image2.src = source;
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
        base.height * scale
      );
    }
    for (const stroke of value.strokes) {
      if (!stroke.points.length) continue;
      ctx.strokeStyle = ctx.fillStyle = stroke.tool === "eraser" ? "#fff" : "#202820";
      ctx.lineWidth = stroke.width * width / PAPER_WIDTH;
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
  async function sketchPng(value) {
    if (!value.base && !value.strokes.length) return "";
    const canvas = document.createElement("canvas");
    canvas.width = PAPER_WIDTH;
    canvas.height = PAPER_HEIGHT;
    draw(canvas.getContext("2d"), value, await loadImage(value.base));
    return canvas.toDataURL("image/png");
  }

  // js/pdf-sketch.js
  function drawPdfSketch(doc, sketch2, x, y, width, height) {
    doc.saveGraphicsState();
    try {
      doc.rect(x, y, width, height, null);
      doc.clip();
      doc.discardPath();
      if (sketch2.base) {
        const image2 = doc.getImageProperties(sketch2.base);
        const scale = Math.min(width / image2.width, height / image2.height);
        const imageWidth = image2.width * scale;
        const imageHeight = image2.height * scale;
        doc.addImage(
          sketch2.base,
          "PNG",
          x + (width - imageWidth) / 2,
          y + (height - imageHeight) / 2,
          imageWidth,
          imageHeight,
          void 0,
          "FAST"
        );
      }
      doc.setLineCap("round");
      doc.setLineJoin("round");
      for (const stroke of sketch2.strokes) {
        if (!stroke.points.length) continue;
        const color = stroke.tool === "eraser" ? [255, 255, 255] : [32, 40, 32];
        doc.setDrawColor(...color);
        doc.setFillColor(...color);
        const thickness = stroke.width * width / PAPER_WIDTH;
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

  // js/pdf.js
  var fonts;
  var engine;
  function loadEngine() {
    if (window.jspdf) return Promise.resolve();
    if (!engine)
      engine = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./vendor/jspdf.umd.min.js";
        script.onload = () => window.jspdf ? resolve() : reject(Error("PDF engine not initialized."));
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
              "PDF font unavailable. Reopen the app online and try again."
            );
          const bytes2 = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes2.length; i += 8192)
            binary += String.fromCharCode(...bytes2.subarray(i, i + 8192));
          return btoa(binary);
        })
      ).catch((error) => {
        fonts = null;
        throw error;
      });
    return fonts;
  }
  async function createPdf(record, png = record.sketchPng || "") {
    await loadEngine();
    const doc = new window.jspdf.jsPDF({
      unit: "mm",
      format: "a4",
      compress: true
    });
    const data = await fontData();
    ["normal", "bold"].forEach((style, index) => {
      const name = `Liberation-${style}.ttf`;
      doc.addFileToVFS(name, data[index]);
      doc.addFont(name, "Liberation", style);
    });
    const left = 10, right = 200, split = 94, bottom = 281, widths = [30, 13, 16, 12, 13];
    const line = (x, y, x2, y2) => doc.line(x, y, x2, y2);
    const text2 = (s, x, y, bold = false, size = 9) => {
      doc.setFont("Liberation", bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.text(s, x, y);
    };
    const wrap = (s, w, size = 9) => {
      doc.setFont("Liberation", "normal");
      doc.setFontSize(size);
      return doc.splitTextToSize(String(s), w);
    };
    function labelLines(label, value, width) {
      const prefix = `${label}:`;
      text2("", 0, 0, true);
      const prefixWidth = doc.getTextWidth(prefix + " ");
      text2("", 0, 0, false);
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
        if (entry.label) text2(entry.label, x, baseline, true);
        if (entry.value) text2(entry.value, x + entry.indent, baseline);
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
        82
      );
      const h = Math.max(12, site.length * 4.3 + 5);
      doc.rect(left, 10, 190, h);
      line(112, 10, 112, 10 + h);
      text2("Ceramic - Summary form", 13, 17, true, 11);
      drawLabel(site, 115, 16);
      const labels = [
        ["Area", record.header.area],
        ["Stratigraphic unit", record.header.stratUnit],
        ["Room", record.header.room]
      ];
      const metadata = labels.map(([key, value]) => labelLines(key, value, 58));
      const mh = Math.max(11, ...metadata.map((lines) => lines.length * 4.3 + 5));
      doc.rect(left, 10 + h, 190, mh);
      metadata.forEach((lines, i) => drawLabel(lines, 13 + i * 63, 16 + h));
      top = 10 + h + mh;
      tableY = top + 15;
      notesY = top + 7;
      text2(
        continuation ? "Fragments (continued)" : "Fragments",
        13,
        top + 5,
        true
      );
      doc.rect(left, top, split - left, 7);
      let x = left;
      ["Type/Form", "Rims", "Handles", "Feet", "Bodies"].forEach((label, i) => {
        doc.rect(x, top + 7, widths[i], 8);
        if (i === 0) text2(label, x + 1.2, top + 12, true, 7.5);
        else {
          doc.setFont("Liberation", "bold");
          doc.setFontSize(7.5);
          doc.text(label, x + widths[i] / 2, top + 11, {
            align: "center",
            baseline: "middle"
          });
        }
        x += widths[i];
      });
      text2("Fabric and remarks", split + 3, top + 5, true);
      line(split, top, split, bottom);
      line(right, top, right, bottom);
      line(split, top, right, top);
      line(left, bottom, right, bottom);
      line(left, tableY, left, bottom);
    }
    header();
    const rows = filledRows(record.rows);
    const rowQueue = rows.map(
      (row2) => COLUMNS.map((key, i) => wrap(row2[key], widths[i] - 3, 8.5))
    );
    const notes = wrap(record.remarks, right - split - 6, 9);
    const sketchModel = record.sketch && Array.isArray(record.sketch.strokes) ? record.sketch : null;
    const hasSketch = sketchModel ? Boolean(
      sketchModel.base || sketchModel.strokes.some((stroke) => stroke.points.length)
    ) : Boolean(png);
    let rowIndex = 0, noteIndex = 0, sketchPending = hasSketch, page = 1;
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
            if (content.length) text2(content, x + 1.5, tableY + 4.3, false, 8.5);
          } else {
            doc.setFont("Liberation", "normal");
            doc.setFontSize(8.5);
            content.forEach(
              (value, index) => doc.text(
                value,
                x + widths[i] / 2,
                tableY + height / 2 + (index - (content.length - 1) / 2) * 4,
                { align: "center", baseline: "middle" }
              )
            );
          }
          x += widths[i];
        });
        tableY += height;
        if (cells.every((c) => !c.length)) rowIndex++;
        else break;
      }
      while (noteIndex < notes.length && notesY + 5 < bottom) {
        text2(notes[noteIndex++], split + 3, notesY + 4, false, 9);
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
              sketchHeight
            );
          } else {
            doc.addImage(
              png,
              "PNG",
              split + 4,
              notesY + 11,
              right - split - 8,
              sketchHeight,
              void 0,
              "FAST"
            );
          }
          sketchPending = false;
        }
      }
      page++;
    } while (rowIndex < rowQueue.length || noteIndex < notes.length || sketchPending);
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
      creator: "Ceramic PWA"
    });
    return doc;
  }

  // js/export-archive.js
  function needsArchive(device = navigator) {
    return /Android|iPhone|iPad|iPod/i.test(device.userAgent || "") || device.platform === "MacIntel" && device.maxTouchPoints > 1;
  }
  var engine2;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!engine2)
      engine2 = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "./vendor/jszip.min.js";
        script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(Error("ZIP engine not initialized."));
        script.onerror = () => {
          script.remove();
          reject(Error("ZIP engine unavailable. Reopen the app online."));
        };
        document.head.append(script);
      }).catch((error) => {
        engine2 = null;
        throw error;
      });
    return engine2;
  }
  function bytes(blob) {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error("Unable to prepare the download."));
      reader.readAsArrayBuffer(blob);
    });
  }
  async function createArchive(files) {
    const JSZip = await loadZip();
    const archive = new JSZip();
    for (const { name, blob } of files) archive.file(name, await bytes(blob));
    return archive.generateAsync({
      type: "blob",
      mimeType: "application/zip",
      compression: "DEFLATE",
      compressionOptions: { level: 3 }
    });
  }

  // js/app.js
  var $ = (selector) => document.querySelector(selector);
  var sketch = emptySketch();
  var dirty = false;
  var busy = false;
  var revision = 0;
  var createdAt = (/* @__PURE__ */ new Date()).toISOString();
  function notify(message) {
    $("#status").textContent = message;
    $("#status").hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => $("#status").hidden = true, 6e3);
  }
  function grow() {
    const box = $("#remarks");
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }
  function row(values = emptyRow()) {
    const tr = document.createElement("tr");
    COLUMNS.forEach((key, index) => {
      const td = document.createElement("td"), input = document.createElement("input");
      input.type = "text";
      input.inputMode = index ? "numeric" : "text";
      input.value = values[key];
      input.dataset.key = key;
      input.maxLength = index ? 12 : 1e3;
      input.setAttribute(
        "aria-label",
        `${["Type/Form", "Rims", "Handles", "Feet", "Bodies"][index]} \u2013 row ${$("#rows").children.length + 1}`
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
    updateRemoveButton();
  }
  function updateRemoveButton() {
    $("#remove-row").disabled = busy || $("#rows").children.length <= 1;
  }
  function removeLastRow() {
    if ($("#rows").children.length <= 1) return;
    $("#rows").lastElementChild.remove();
    dirty = true;
    revision++;
    updateRemoveButton();
  }
  $("#remove-row").onclick = () => {
    if ($("#rows").children.length <= 1) return;
    const filled = [
      ...$("#rows").lastElementChild.querySelectorAll("input")
    ].some((input) => input.value.trim());
    if (filled) $("#remove-dialog").showModal();
    else removeLastRow();
  };
  $("#remove-no").onclick = () => $("#remove-dialog").close();
  $("#remove-yes").onclick = () => {
    removeLastRow();
    $("#remove-dialog").close();
  };
  function collect() {
    return {
      schema: "ceramic-summary-form-pwa-v3",
      createdAt,
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      header: Object.fromEntries(HEADER.map((key) => [key, $(`#${key}`).value])),
      rows: [...$("#rows").children].map(
        (tr) => Object.fromEntries(
          [...tr.querySelectorAll("input")].map((input) => [
            input.dataset.key,
            input.value
          ])
        )
      ),
      remarks: $("#remarks").value,
      sketch: clone(sketch)
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
    revision++;
    sketch = emptySketch();
    createdAt = (/* @__PURE__ */ new Date()).toISOString();
    dirty = false;
    preview();
  }
  var editor = new SketchEditor($("#sketch-dialog"), (value) => {
    sketch = value;
    dirty = true;
    revision++;
    preview().catch((error) => notify(error.message));
  });
  $("#open-sketch").onclick = () => editor.open(sketch).catch((error) => notify(error.message));
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
    if ($("#rows").children.length >= 5e3)
      return notify("The limit of 5,000 rows has been reached.");
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
  function downloadFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  $("#export-files").onclick = async () => {
    if (busy) return;
    busy = true;
    const button = $("#export-files");
    button.disabled = true;
    updateRemoveButton();
    $("#reset-sheet").disabled = true;
    button.textContent = "Preparing\u2026";
    const snapshotRevision = revision;
    try {
      const record = collect();
      const stem = filename(record.header);
      record.sketchPng = await sketchPng(record.sketch);
      const doc = await createPdf(record);
      const files = [
        {
          blob: doc.output("blob"),
          name: `${stem}.pdf`
        },
        {
          blob: new Blob([JSON.stringify(record, null, 2)], {
            type: "application/json"
          }),
          name: `${stem}.json`
        }
      ];
      if (needsArchive()) {
        downloadFile(await createArchive(files), `${stem}.zip`);
      } else {
        for (const file of files) downloadFile(file.blob, file.name);
      }
      if (revision === snapshotRevision) dirty = false;
    } catch (error) {
      notify(
        "Export failed. Please try again. If the problem persists, reopen the app online."
      );
    } finally {
      busy = false;
      updateRemoveButton();
      button.disabled = false;
      $("#reset-sheet").disabled = false;
      button.textContent = "Save PDF and JSON";
    }
  };
  $("#import").onclick = () => $("#json-file").click();
  $("#json-file").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 3e7) throw Error("The file exceeds the 30 MB limit.");
      let raw;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        throw Error("Invalid or unreadable JSON file.");
      }
      const record = parseRecord(raw);
      await sketchPng(record.sketch);
      reset();
      HEADER.forEach((key) => $(`#${key}`).value = record.header[key]);
      $("#remarks").value = record.remarks;
      $("#rows").replaceChildren();
      record.rows.forEach(row);
      sketch = record.sketch;
      createdAt = typeof raw.createdAt === "string" ? raw.createdAt : (/* @__PURE__ */ new Date()).toISOString();
      await preview();
      dirty = false;
      showForm();
      notify("Form imported.");
    } catch (error) {
      notify(`Import failed: ${error.message}`);
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
})();
