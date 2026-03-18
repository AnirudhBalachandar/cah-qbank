const CACHE_PREFIX = "cah-qbank-pwa";
const OFFLINE_CACHE = `${CACHE_PREFIX}-offline-v1`;
const STATIC_CACHE = `${CACHE_PREFIX}-static-v1`;
const OFFLINE_URL = "/~offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== OFFLINE_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon-192x192.png" ||
    pathname === "/icon-512x512.png" ||
    pathname === "/apple-touch-icon.png"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const { pathname } = url;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/data/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(OFFLINE_CACHE);
          const cachedOffline = await cache.match(OFFLINE_URL);
          return cachedOffline || Response.error();
        }
      })(),
    );
    return;
  }

  if (!isStaticAsset(pathname)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);

      const networkPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        return cached;
      }

      const networkResponse = await networkPromise;
      return networkResponse || Response.error();
    })(),
  );
});
