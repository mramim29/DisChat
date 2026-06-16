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
  // FORCE THE NEW SERVICE WORKER TO TAKE CONTROL IMMEDIATELY
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('>>> [PWA_CORE]: Core Shell Buffered Successfully');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 1b. Activation Phase - Flush old residual caches when the script changes
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


// 3. BACKGROUND PUSH ALERTS MATRIX INTERCEPTOR
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
        
        //STACKING AND GROUPING LIKE MESSENGER
        // Using 'dischat-msg-group' clusters notifications from the same app together
        tag: 'dischat-msg-group', 
        
        // FORCE ALERT BEHAVIOR
      
        renotify: true,
        
        //  MAX VISIBILITY RULES FOR MOBILE OPERATING SYSTEMS
       
        behavior: 'default',
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, notificationOptions)
    );
});

// 4. Click Action Handling & Smart Window Focus Routing
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Resolve absolute destination URL based on application scope root
    const targetUrl = new URL(event.notification.data.url, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if any open tab matches our absolute app URL destination route
            for (let client of windowClients) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            // If the app is completely closed in the background, open a clean window instance
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});