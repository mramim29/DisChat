const CACHE_NAME = 'dischat-matrix-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('>>> [PWA_CORE]: Core Shell Buffered Successfully');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('>>> [PWA_CORE]: Purging Legacy Cache Bin:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Clear control pathways instantly
  );
});


self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('socket.io')) return;

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});


self.addEventListener('push', (event) => {
    let payload = { title: 'New Message', body: 'Incoming secure data link established.' };
    
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    const notificationOptions = {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png', // Small icon for the top Android status bar
        
        vibrate: [200, 100, 200], 
        
        data: { url: '/' },
        
        tag: 'dischat-msg-group', 
        
      
        renotify: true,
        
       
        behavior: 'default',
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, notificationOptions)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const targetUrl = new URL(event.notification.data.url, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let client of windowClients) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});