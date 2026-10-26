/* Ogni rilascio ha una cache completa e isolata per questa PWA. */
const VERSION = "1.2.0";
const PREFIX = `ceramic-${self.registration.scope}-`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./pwa-install.js",
  "./bootstrap.js",
  "./app.bundle.js",
  "./vendor/jspdf.umd.min.js",
  "./assets/excavation.webp",
  "./assets/LiberationSans-Regular.ttf",
  "./assets/LiberationSans-Bold.ttf",
  "./assets/cursor-pen.svg",
  "./assets/cursor-eraser.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(
        ASSETS.map(
          (path) =>
            new Request(new URL(path, self.registration.scope), {
              cache: "reload",
            }),
        ),
      ),
    ),
  );
});
// L'aggiornamento si attiva alla chiusura di tutte le finestre precedenti:
// evita di mescolare editor e risorse appartenenti a rilasci diversi.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    !event.request.url.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Cerca anche l'URL senza query: HTML e script di questo rilascio
      // restano coerenti anche se si naviga con parametri o offline.
      const plain = new URL(event.request.url);
      plain.search = "";
      const found =
        (await cache.match(event.request)) || (await cache.match(plain.href));
      if (found) return found;
      try {
        return await fetch(event.request);
      } catch (error) {
        if (event.request.mode === "navigate")
          return cache.match(
            new URL("./index.html", self.registration.scope).href,
          );
        throw error;
      }
    }),
  );
});
