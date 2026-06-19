// Service worker: makes HK Mahjong installable and playable offline.
// Solo vs bots works fully offline because the game engine runs in-browser.
// Bump CACHE when assets change so clients pick up updates.
const CACHE = 'hkmj-v2';

// All paths are relative to the SW scope, so this works at the site root
// (Node/Cloudflare) and under the /mahjong-game/ subpath (GitHub Pages).
const ASSETS = [
  './', './index.html', './client.js', './game-core.js', './local-core.js',
  './manifest.json',
  './assets/vendor/phaser.min.js', './assets/vendor/peerjs.min.js',
  './assets/icon-192.png', './assets/icon-512.png',
];
for (let i = 1; i <= 9; i++) ['w', 's', 't'].forEach(p => ASSETS.push(`./assets/tiles/${p}${i}.svg`));
for (let i = 1; i <= 4; i++) ASSETS.push(`./assets/tiles/f${i}.svg`);
for (let i = 1; i <= 3; i++) ASSETS.push(`./assets/tiles/d${i}.svg`);
for (let i = 1; i <= 8; i++) ASSETS.push(`./assets/tiles/h${i}.svg`);

self.addEventListener('install', e => {
  self.skipWaiting();
  // Cache resiliently: a single 404 (e.g. game-core.js on the bare Node server)
  // must not abort the whole install.
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(u => c.add(u)))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

const putCache = (req, res) => { const c = res.clone(); caches.open(CACHE).then(cc => cc.put(req, c)).catch(() => {}); return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('/ws')) return;        // WebSocket endpoint
  if (url.origin !== location.origin) return;      // let cross-origin pass through

  // Static assets (tiles, fonts, vendor libs, icons) rarely change → cache-first.
  const isAsset = url.pathname.includes('/assets/');
  if (isAsset) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => putCache(req, res))));
    return;
  }
  // App code & pages → network-first so updates always reach online players;
  // fall back to cache (and index.html) when offline.
  e.respondWith(
    fetch(req).then(res => putCache(req, res))
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
