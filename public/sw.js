const CACHE_NAME = "attendwise-cache-v2";
const OFFLINE_URL = "/";
const urlsToCache = [
  "/",
  "/manifest.json",
  "/icon-192x192.png",
  "/icon-512x512.png"
];

// Install: cache critical resources
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API calls, cache-first for assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests
  if (event.request.method !== "GET" || url.origin !== location.origin) return;

  // API calls: network only
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets + SPA: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback: serve index.html for navigation
          if (event.request.mode === "navigate") {
            return caches.match(OFFLINE_URL);
          }
        });
      return cachedResponse || fetchPromise;
    })
  );
});

// Background sync placeholder
self.addEventListener("sync", (event) => {
  console.log("Background sync triggered:", event.tag);
});

// Push notification placeholder
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "AttendWise";
  const options = {
    body: data.body || "Check your attendance status",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
