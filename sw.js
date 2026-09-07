/* ============================================================
   SERVICE WORKER — SmartHome Dashboard PWA
   Offline caching and fast local asset delivery
   ============================================================ */

const CACHE_NAME = 'smarthome-v1.0.17';


const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/layouts.css',
  './css/animations.css',
  './js/app.js',
  './js/router.js',
  './js/state.js',
  './js/icons.js',
  './js/services/storage.js',
  './js/services/device-service.js',
  './js/services/weather-service.js',
  './js/services/meross-service.js',
  './js/services/alarm-service.js',
  './js/pages/dashboard.js',
  './js/pages/lights.js',
  './js/pages/climate.js',
  './js/pages/security.js',
  './js/pages/settings.js',
  './assets/icons/icon.svg'
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate strategy for app assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Never cache backend API calls
  if (event.request.url.includes('/api/')) return;

  // Don't intercept foreign requests (e.g. google fonts, external APIs)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback or offline offline
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
