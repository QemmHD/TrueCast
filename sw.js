// Cache only the app shell. Forecast APIs and map tiles retain normal network behavior.
const CACHE = "truecast-shell-v3.1";
const ROOT = new URL("./", self.location.href);
const SHELL = [
  "index.html",
  "style.css",
  "app.js",
  "api.js",
  "refresh.js",
  "forecast-time.js",
  "sources.js",
  "radar.js",
  "ui.js",
  "install.js",
  "manifest.webmanifest",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
const shellURLs = new Set(SHELL.map((path) => new URL(path, ROOT).href));
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          [...shellURLs].map((url) => new Request(url, { cache: "reload" })),
        ),
      )
      .then(() => {
        if (!self.registration.active) return self.skipWaiting();
      }),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("truecast-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin) return;
  const isAppPage =
    event.request.mode === "navigate" &&
    (url.pathname === ROOT.pathname ||
      url.pathname === new URL("index.html", ROOT).pathname);
  if (!isAppPage && !shellURLs.has(url.href)) return;
  const key = isAppPage ? new URL("index.html", ROOT).href : url.href;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(key);
      if (saved) return saved;
      try {
        const response = await fetch(event.request, { cache: "no-cache" });
        if (response.ok) {
          await cache.put(key, response.clone());
          return response;
        }
        return (await cache.match(key)) || response;
      } catch {
        const saved = await cache.match(key);
        return (
          saved ||
          new Response("TrueCast is offline. Reconnect to load the app.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }
    })(),
  );
});
