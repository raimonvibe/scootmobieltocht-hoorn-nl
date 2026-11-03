// Offline support. The app itself and the route data are cached on install; map tiles, fonts and
// libraries are kept as you view them. Bump VERSION when you deploy changes to the app files.
const VERSION = "v3";
const APP = `app-${VERSION}`;
const RUNTIME = "runtime";
const MAX_RUNTIME = 4000; // ~ a few hundred MB at most; old entries are dropped first

const SHELL = [
  "./", "index.html", "style.css", "app.js", "router.js", "pois.js", "weather.js", "follow.js", "saved.js",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "data/graph.json", "data/places.json", "data/pois.json",
  "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("app-") && k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim() {
  const c = await caches.open(RUNTIME);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_RUNTIME; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Weather must be fresh; don't cache it.
  if (url.hostname === "api.open-meteo.com") return;

  // App files: network first (so updates arrive), cache when offline.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(APP).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
    );
    return;
  }

  // Tiles, styles, fonts, libraries: cache first, refresh in the background.
  if (["tiles.openfreemap.org", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy)).then(trim);
          }
          return res;
        });
        return hit || net;
      }),
    );
  }
});
