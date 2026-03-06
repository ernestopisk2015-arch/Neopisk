// Neo Pisk SW - admin
var CACHE = 'neopisk-admin-v2';

self.addEventListener('install', function(e) {
  console.log('[SW] Install');
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(['./index.html', './manifest.json']);
    }).catch(function(err) {
      console.log('[SW] Cache error', err);
    })
  );
});

self.addEventListener('activate', function(e) {
  console.log('[SW] Activate');
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).catch(function() {
        return caches.match('./index.html');
      });
    })
  );
});
