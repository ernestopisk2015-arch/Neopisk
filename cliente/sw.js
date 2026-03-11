const CACHE_NAME = 'grupay-v3';
const ASSETS = [
  '/cliente/',
  '/cliente/index.html',
  '/cliente/manifest.json',
  '/cliente/icon-192.png',
  '/cliente/icon-512.png',
];

// Dominios que NUNCA se cachean (siempre red directa)
const BYPASS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'gstatic.com',
  'firebaseio.com',
  'cloudinary.com',
  'nominatim.openstreetmap.org',
  'wa.me',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Instalar y cachear assets principales
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar y limpiar caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network first, cache fallback
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Nunca interceptar Firebase ni APIs externas
  if (BYPASS.some(domain => url.includes(domain))) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('/cliente/'))
      )
  );
});
