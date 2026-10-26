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
      throw Error("Campo JSON non valido o troppo lungo.");
    return String(value);
  }
  function image(value) {
    if (!value) return "";
    if (typeof value !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 2e7)
      throw Error("Immagine dello schizzo non valida.");
    return value;
  }
  function parseRecord(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.rows) || !data.header || data.rows.length > 5e3)
      throw Error("Il file non \xE8 una scheda Ceramic compatibile.");
    const header = Object.fromEntries(
      HEADER.map((key) => [key, text(data.header[key], 300)])
    );
    const rows = data.rows.map((row2) => {
      if (!row2 || typeof row2 !== "object") throw Error("Riga non valida.");
      return Object.fromEntries(
        COLUMNS.map((key) => {
          const value = text(row2[key], key === "typeForm" ? 1e3 : 12);
          if (key !== "typeForm" && !/^\d*$/.test(value))
            throw Error("I conteggi devono essere numeri interi non negativi.");
          return [key, value];
        })
      );
    });
    let sketch2 = emptySketch();
    if (data.schema === "ceramic-summary-form-pwa-v3" && data.sketch) {
      sketch2.base = image(data.sketch.base);
      if (!Array.isArray(data.sketch.strokes) || data.sketch.strokes.length > 3e4)
        throw Error("Schizzo troppo grande.");
      let pointCount = 0;
      sketch2.strokes = data.sketch.strokes.map((stroke) => {
        if (!["pen", "eraser"].includes(stroke.tool) || !Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 100 || !Array.isArray(stroke.points))
          throw Error("Tratto non valido.");
        pointCount += stroke.points.length;
        if (pointCount > 1e6) throw Error("Troppi punti nello schizzo.");
        const points = stroke.points.map((point) => {
          if (!Array.isArray(point) || point.length !== 2 || point.some((n) => !Number.isFinite(n) || n < 0 || n > 1))
            throw Error("Coordinate dello schizzo non valide.");
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

  // js/sketch.js
  var WIDTH = 1200;
  var HEIGHT = 900;
  var SketchEditor = class {
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
      document.querySelector("#save-sketch").onclick = () => this.save();
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this.save();
      });
      if (typeof ResizeObserver !== "undefined") {
        new ResizeObserver(() => this.fit()).observe(
          document.querySelector(".canvas-area")
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
        area.clientHeight / HEIGHT
      );
      this.canvas.style.width = `${WIDTH * scale}px`;
      this.canvas.style.height = `${HEIGHT * scale}px`;
    }
    point(event) {
      const rect = this.canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      ];
    }
    start(event) {
      if (this.active || event.pointerType === "mouse" && event.button !== 0)
        return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.active = {
        id: event.pointerId,
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
      var _a;
      if (!this.active || this.active.id !== event.pointerId) return;
      event.preventDefault();
      const events = (_a = event.getCoalescedEvents) == null ? void 0 : _a.call(event);
      for (const pointEvent of (events == null ? void 0 : events.length) ? events : [event])
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
  };
  function loadImage(source) {
    if (!source) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const image2 = new Image();
      image2.onload = () => resolve(image2);
      image2.onerror = () => reject(Error("Impossibile leggere lo schizzo."));
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
      ctx.lineWidth = stroke.width * width / WIDTH;
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
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    draw(canvas.getContext("2d"), value, await loadImage(value.base));
    return canvas.toDataURL("image/png");
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
        script.onload = () => window.jspdf ? resolve() : reject(Error("Motore PDF non inizializzato."));
        script.onerror = () => {
          script.remove();
          reject(Error("Motore PDF non disponibile. Riapri l\u2019app online."));
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
              "Font PDF non disponibile. Riprova dopo un caricamento online."
            );
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return btoa(binary);
        })
      ).catch((error) => {
        fonts = null;
        throw error;
      });
    return fonts;
  }
  async function createPdf(record, png) {
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
    let tableY, notesY, top;
    function header(continuation = false) {
      doc.setLineWidth(0.2);
      doc.setDrawColor(0);
      doc.setTextColor(0);
      const site = wrap(`Excavation site: ${record.header.excavationSite}`, 82);
      const h = Math.max(12, site.length * 4.3 + 5);
      doc.rect(left, 10, 190, h);
      line(112, 10, 112, 10 + h);
      text2("Ceramic - Summary form", 13, 17, true, 11);
      text2(site, 115, 16, false, 9);
      const labels = [
        ["Area", record.header.area],
        ["Strat. Unit", record.header.stratUnit],
        ["Room", record.header.room]
      ];
      const metadata = labels.map(([key, value]) => wrap(`${key}: ${value}`, 58));
      const mh = Math.max(11, ...metadata.map((t) => t.length * 4.3 + 5));
      doc.rect(left, 10 + h, 190, mh);
      metadata.forEach((t, i) => text2(t, 13 + i * 63, 16 + h));
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
        text2(label, x + 1.2, top + 12, true, 7.5);
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
    let rowIndex = 0, noteIndex = 0, sketchPending = Boolean(png), page = 1;
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
          text2(lines.splice(0, count), x + 1.5, tableY + 4.3, false, 8.5);
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
          sketchPending = false;
        }
      }
      text2(String(page), 195, 289, false, 8);
      page++;
    } while (rowIndex < rowQueue.length || noteIndex < notes.length || sketchPending);
    doc.setProperties({
      title: "Ceramic - Summary form",
      subject: record.header.excavationSite,
      creator: "Ceramic PWA"
    });
    return doc;
  }

  // js/app.js
  var $ = (selector) => document.querySelector(selector);
  var sketch = emptySketch();
  var dirty = false;
  var busy = false;
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
        `${["Type/Form", "Rims", "Handles", "Feet", "Bodies"][index]} \u2013 riga ${$("#rows").children.length + 1}`
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
  }
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
    for (let i = 0; i < 4; i++) row();
    sketch = emptySketch();
    createdAt = (/* @__PURE__ */ new Date()).toISOString();
    dirty = false;
    preview();
  }
  var editor = new SketchEditor($("#sketch-dialog"), (value) => {
    sketch = value;
    dirty = true;
    preview().catch((error) => notify(error.message));
  });
  $("#open-sketch").onclick = () => editor.open(sketch).catch((error) => notify(error.message));
  $("#new").onclick = () => {
    reset();
    showForm();
  };
  $("#record").onsubmit = (event) => event.preventDefault();
  $("#record").addEventListener("input", () => dirty = true);
  $("#remarks").addEventListener("input", grow);
  $("#add-row").onclick = () => {
    if ($("#rows").children.length >= 5e3)
      return notify("Limite di 5.000 righe raggiunto.");
    row();
    dirty = true;
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
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  $("#json").onclick = async () => {
    try {
      const record = collect();
      record.sketchPng = await sketchPng(record.sketch);
      download(
        new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
        `${filename(record.header)}.json`
      );
      dirty = false;
      notify("JSON esportato.");
    } catch (error) {
      notify(error.message);
    }
  };
  $("#import").onclick = () => $("#json-file").click();
  $("#json-file").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 3e7) throw Error("Il file supera il limite di 30 MB.");
      const raw = JSON.parse(await file.text()), record = parseRecord(raw);
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
      notify("Scheda importata.");
    } catch (error) {
      notify(`Importazione non riuscita: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  };
  $("#pdf").onclick = async () => {
    if (busy) return;
    busy = true;
    $("#pdf").disabled = true;
    $("#pdf").textContent = "Preparazione\u2026";
    try {
      const record = collect();
      const doc = await createPdf(record, await sketchPng(record.sketch));
      download(doc.output("blob"), `${filename(record.header)}.pdf`);
      notify("PDF esportato.");
    } catch (error) {
      notify(`PDF non creato: ${error.message}`);
    } finally {
      busy = false;
      $("#pdf").disabled = false;
      $("#pdf").textContent = "Esporta PDF";
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
