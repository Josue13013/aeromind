const CACHE = 'aeromind-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './audio.js',
  './manifest.json',
  './img/aeromind-mark.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/.netlify/')) return;
  const lookup = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(lookup, { ignoreSearch: true }))
      .then((cached) => cached || fetch(request)),
  );
});
