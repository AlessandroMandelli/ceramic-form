/* Increase VERSION for each release. Only this app's cache is managed. */
const VERSION = "ceramic-v1.0.0";
const PREFIX = `ceramic-${self.registration.scope}-`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/data.js",
  "./js/sketch.js",
  "./js/pdf.js",
  "./vendor/jspdf.umd.min.js",
  "./assets/excavation.webp",
  "./assets/DejaVuSans.ttf",
  "./assets/DejaVuSans-Bold.ttf",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
// Do not skipWaiting: a new release activates after all old app windows close.
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
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const found = await cache.match(event.request, { ignoreSearch: false });
      if (found) return found;
      try {
        return await fetch(event.request);
      } catch (error) {
        if (
          event.request.mode === "navigate" &&
          new URL(event.request.url).pathname.startsWith(
            new URL(self.registration.scope).pathname,
          )
        )
          return cache.match("./index.html");
        throw error;
      }
    }),
  );
});
