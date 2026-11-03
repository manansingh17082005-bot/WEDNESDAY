const CACHE = "wednesday-command-center-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./wednesday-cartoon-theme.css",
  "./companions.css",
  "./companions.js",
  "./app.js",
  "./voice.js",
  "./config.js",
  "./manifest.webmanifest",
  "./assets/favicon.svg",
  "./assets/shinchan.webp"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("wednesday-") && key !== CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/*
 * Network-first for this small app: users receive the latest GitHub Pages
 * HTML, JavaScript and CSS after a deployment. Cached copies are an
 * offline fallback, not a reason to keep running an old broken app.js.
 */
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached;
          if (request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        })
      )
  );
});
