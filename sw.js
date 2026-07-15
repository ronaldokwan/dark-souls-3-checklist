/*
 * Service worker: makes the cheat sheet installable and fully usable offline.
 * Strategy: precache the app shell on install, then stale-while-revalidate for
 * every same-origin GET (serve from cache instantly, refresh in the background).
 * Bump CACHE to force clients onto a new set of assets.
 */
const CACHE = 'ds3-cheatsheet-v5';
const CORE = [
  './',
  './index.html',
  './assets/css/main.css',
  './assets/js/render.js',
  './assets/js/main.js',
  './assets/js/storage.js',
  './assets/js/profiles.js',
  './data/checklist.json',
  './manifest.webmanifest',
  './assets/vendor/bootstrap.min.css',
  './assets/vendor/bootstrap.bundle.min.js',
  './assets/vendor/bootstrap-icons/bootstrap-icons.min.css',
  './assets/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
