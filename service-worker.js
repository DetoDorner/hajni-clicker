// ============================================================
// service-worker.js – Hajni Burger Clicker
// ------------------------------------------------------------
// STRATÉGIA: "hálózat-először" (network-first).
//   • Ha VAN internet: mindig a legfrissebb fájlt tölti a hálózatról,
//     és közben frissíti a cache-t. → Nincs többé régi/új keveredés.
//   • Ha NINCS internet: a cache-ből szolgál ki (offline is megy).
// Frissítéskor csak növeld a CACHE_NAME verziószámát.
// ============================================================

const CACHE_NAME = "hajni-clicker-v20";

const CORE_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./config.js",
  "./manifest.json",
];

const OPTIONAL_FILES = [
  "./images/hajni.png",
  "./audio/hajni-theme.mp3",
  "./images/icon-192.png",
  "./images/icon-512.png",
];

// ── INSTALL: előtöltjük a fájlokat (offline-hoz) ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_FILES).then(() =>
        Promise.allSettled(OPTIONAL_FILES.map((u) => cache.add(u).catch(() => {})))
      )
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: régi cache-ek törlése, azonnali átvétel ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: hálózat-először, cache tartalék ──
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // sikeres, azonos-eredetű válasz → frissítjük a cache-t
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        }
        return res;
      })
      .catch(() =>
        // nincs net → cache; ha ott sincs, a főoldallal próbálkozunk
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
