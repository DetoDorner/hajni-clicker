// ============================================================
// service-worker.js – Hajni Burger Clicker
// Offline működés: az első megnyitáskor minden fájlt elment,
// utána internet nélkül is fut. (Ugyanaz az elv, mint a Kincsvadászatnál.)
// Ha frissítesz valamit, növeld a CACHE_NAME verziószámát.
// ============================================================

const CACHE_NAME = "hajni-clicker-v6";

// Minden fájl, amit a játék használ. (Nincs képfájl-függőség: emoji ikonok.)
const CORE_FILES = [
  "./index.html",
  "./style.css",
  "./script.js",
  "./config.js",
  "./manifest.json",
];

// Opcionális fájlok, amik lehet, hogy még nem léteznek (pl. ikonok).
// Ha hiányoznak, nem akad el a telepítés.
const OPTIONAL_FILES = [
  "./images/hajni.png",   // Hajni 2×2 sprite (Alvás/Éhes/Extrém éhes/Közömbös)
  "./images/icon-192.png",
  "./images/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_FILES).then(() => {
        return Promise.allSettled(
          OPTIONAL_FILES.map(url => cache.add(url).catch(() => {}))
        );
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
