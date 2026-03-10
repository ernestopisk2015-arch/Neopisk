const CACHE = "grupay-v1";
const ASSETS = [
  "/grupay/",
  "/grupay/index.html"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  // Solo cachear GET
  if (e.request.method !== "GET") return;
  // No cachear Firebase/Cloudinary
  if (e.request.url.includes("firestore") || e.request.url.includes("cloudinary") || e.request.url.includes("googleapis")) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const clone = response.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return response;
      }).catch(() => caches.match("/grupay/index.html"));
    })
  );
});
