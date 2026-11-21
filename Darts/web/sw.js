// Service Worker der PWA: alles offline verfügbar; jede Version (vom Build gesetzt) bekommt einen eigenen Cache.
// Die App zeigt „Neue Version verfügbar“, sobald ein neuer Worker wartet (siehe js/update.js).
const VERSION = '__VERSION__';
const CACHE = 'darts-arena-' + VERSION;
const FILES = [
  './', 'index.html', 'iphone.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/board.js', 'js/games.js', 'js/checkout.js', 'js/caller.js', 'js/audio.js', 'js/store.js',
  'js/progress.js', 'js/rules.js', 'js/update.js', 'js/native.js', 'js/music.js', 'js/cam.js', 'js/voice.js', 'js/log.js', 'js/online.js', 'js/friends.js', 'js/vendor/peerjs.min.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('darts-arena-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Versionsdatei immer frisch
  if (req.url.endsWith('version.json')) { e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req))); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
