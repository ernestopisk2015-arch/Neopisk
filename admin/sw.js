// Neo Pisk admin - Service Worker
// Updated: 1772765121
var CACHE_NAME = 'neopisk-admin-v3';
var URLS = ['./index.html', './manifest.json', './sw.js'];

self.addEventListener('install', function(event) {
  console.log('[SW:admin] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS);
    })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[SW:admin] Activating...');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== CACHE_NAME; })
              .map(function(k) { return caches.delete(k); })
        );
      })
    ])
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});
