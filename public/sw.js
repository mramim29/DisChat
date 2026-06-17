const CACHE_NAME = 'dischat-v6'; 
const STATIC_ASSETS = ['/', '/index.html', '/style.css', '/script.js', '/manifest.json'];

// Lifecycle: Install & Activate
self.addEventListener('install', (e) => self.skipWaiting());

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k))))
        .then(() => self.clients.claim())
    );
});

// Push Event: Handle incoming alerts
self.addEventListener('push', (e) => {
    let payload = { title: 'New Message', body: '...' };
    if (e.data) {
        try { payload = e.data.json(); } catch (err) { payload.body = e.data.text(); }
    }

    const options = {
        body: payload.body,
        icon: '/icon-192.png',
        badge: '/notification-badge.png', 
        vibrate: [200, 100, 200],
        data: payload.data,
        tag: payload.data?.url || 'chat-default',
        renotify: true
    };

    e.waitUntil(self.registration.showNotification(payload.title, options));
});


self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = new URL(e.notification.data?.url || '/', self.location.origin).href;

    e.waitUntil(
        clients.matchAll({ type: 'window' }).then(clients => {
            const client = clients.find(c => c.url.includes(url) && 'focus' in c);
            return client ? client.focus() : self.clients.openWindow(url);
        })
    );
});