// Offline cache for the siddur. scripts/build.mjs fills in the version and the file list.
const VERSION = "1b351e1fc9";
const FILES = ["./","app.css","app.js","fonts/frank-ruhl-libre-LICENSE.txt","fonts/frank-ruhl-libre-hebrew-400-normal.woff2","fonts/frank-ruhl-libre-hebrew-700-normal.woff2","fonts/frank-ruhl-libre-latin-400-normal.woff2","fonts/frank-ruhl-libre-latin-700-normal.woff2","fonts/rubik-LICENSE.txt","fonts/rubik-hebrew-400-normal.woff2","fonts/rubik-hebrew-500-normal.woff2","fonts/rubik-hebrew-600-normal.woff2","fonts/rubik-latin-400-normal.woff2","fonts/rubik-latin-500-normal.woff2","fonts/rubik-latin-600-normal.woff2","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.webmanifest","siddur.json"];
const CACHE = "siddur-" + VERSION;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("siddur-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (req.mode === "navigate") return caches.match("./").then((page) => page || fetch(req));
      return fetch(req);
    })
  );
});
