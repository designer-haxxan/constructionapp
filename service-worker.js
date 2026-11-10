// Offline shell for the materials ledger. Ledger data lives in IndexedDB on the device, not in this cache.
// Bump VERSION whenever a file in SHELL changes so installed copies pick up the new files.
const VERSION = 'materials-ledger-v2.0.0';
const SHELL = [
  './', './index.html', './manifest.json', './icon.svg', './css/styles.css',
  './js/main.js', './js/store.js', './js/auth.js', './js/ui.js', './js/domain.js', './js/seed.js',
  './js/views/common.js', './js/views/dashboard.js', './js/views/bills.js', './js/views/purchases.js',
  './js/views/parties.js', './js/views/stock.js', './js/views/prices.js', './js/views/reports.js', './js/views/settings.js',
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    for (const url of CDN) {
      try { const res = await fetch(url, { mode: 'cors' }); if (res.ok) await cache.put(url, res); } catch { /* cached on first use */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('materials-ledger-') && key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isCdn = CDN.includes(req.url) || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';
  if (!sameOrigin && !isCdn) return; // never cache the sign-in API
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && (sameOrigin || isCdn)) cache.put(req, res.clone());
      return res;
    } catch {
      return cache.match('./index.html');
    }
  })());
});
