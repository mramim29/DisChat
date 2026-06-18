const CACHE_NAME = 'dischat-matrix-v4';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json'
];

// 1. Install: Cache the shell
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// 2. Activate: Purge legacy caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => 
            Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// 3. Fetch: Network-first, fallback to cache
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('socket.io')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Update cache with fresh version
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

//PUSH EVENT
self.addEventListener('push', (event) => {
    // Default payload
    let payload = {
        title: 'DisChat',
        body: 'New activity detected.',
        sender: null,
        roomId: null,
        roomName: null
    };

    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    // Build deep-link URL with roomId and roomName
    const deepLinkUrl = `/?join=${encodeURIComponent(payload.roomId || '')}&name=${encodeURIComponent(payload.roomName || '')}`;

    
    const tag = payload.sender ? `dischat-msg-${payload.sender}` : 'dischat-alert';

    const options = {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/notification-badge.png',
        vibrate: [200, 100, 200],
        data: { url: deepLinkUrl },
        tag: tag,
        renotify: true
    };

    event.waitUntil(self.registration.showNotification(payload.title, options));
});

// 5. Notification Click: Deep link handling
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data.url, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Try to focus an existing window
            for (const client of clientList) {
                if (client.url === targetUrl && 'focus' in client) return client.focus();
            }
            // Otherwise open a new window
            return clients.openWindow(targetUrl);
        })
    );
});