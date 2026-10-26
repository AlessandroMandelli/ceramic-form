import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function worker() {
  const scope = "https://example.org/archeologia/";
  const handlers = new Map();
  const files = new Map();
  const cache = {
    async addAll(requests) {
      for (const request of requests) {
        const relative =
          new URL(request.url).pathname.replace("/archeologia/", "") ||
          "index.html";
        const bytes = fs.readFileSync(
          new URL("../" + relative, import.meta.url),
        );
        files.set(request.url, bytes);
      }
    },
    async match(request) {
      return files.get(typeof request === "string" ? request : request.url);
    },
  };
  const deleted = [];
  const context = {
    URL,
    Request,
    self: {
      registration: { scope },
      clients: { claim: async () => {} },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
    caches: {
      open: async () => cache,
      keys: async () => ["another-app-cache", `ceramic-${scope}-old`],
      delete: async (key) => {
        deleted.push(key);
      },
    },
    fetch: async () => {
      throw Error("Offline");
    },
  };
  vm.runInNewContext(
    fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8"),
    context,
  );
  return { scope, handlers, files, deleted };
}
async function dispatchWait(worker, name) {
  let pending;
  worker.handlers.get(name)({ waitUntil: (value) => (pending = value) });
  await pending;
}

test("offline cache contains every required deployed resource, including bundled editor and fonts", async () => {
  const w = worker();
  await dispatchWait(w, "install");
  assert.ok(w.files.has(w.scope + "app.bundle.js"));
  assert.ok(w.files.has(w.scope + "assets/LiberationSans-Regular.ttf"));
  assert.ok(w.files.has(w.scope + "vendor/jspdf.umd.min.js"));
  let pending;
  w.handlers.get("fetch")({
    request: {
      url: w.scope + "app.bundle.js?v=1.1.0",
      method: "GET",
      mode: "cors",
    },
    respondWith: (value) => (pending = value),
  });
  assert.ok((await pending).length > 0);
});
test("offline navigation falls back to cached home and other apps are not intercepted", async () => {
  const w = worker();
  await dispatchWait(w, "install");
  let pending;
  w.handlers.get("fetch")({
    request: { url: w.scope + "unknown", method: "GET", mode: "navigate" },
    respondWith: (value) => (pending = value),
  });
  assert.match((await pending).toString(), /Ceramic/);
  let intercepted = false;
  w.handlers.get("fetch")({
    request: { url: "https://example.org/SMV/", method: "GET" },
    respondWith: () => (intercepted = true),
  });
  assert.equal(intercepted, false);
});
test("activation removes only this app’s previous caches", async () => {
  const w = worker();
  await dispatchWait(w, "activate");
  assert.deepEqual(w.deleted, [`ceramic-${w.scope}-old`]);
});
