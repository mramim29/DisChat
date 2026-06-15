const CACHE_NAME = 'dischat-matrix-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/favicon.ico'
];

// 1. Install Phase - Cache the core visual shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('>>> [PWA_CORE]: Core Shell Buffered Successfully');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 2. Network-First, Cache-Fallback Strategy
// This allows UI to load fast while letting socket.io take over live connections
self.addEventListener('fetch', (event) => {
  // Ignore Socket.io traffic handshake requests completely
  if (event.request.url.includes('socket.io')) return;

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});