/* Public fallback only. Never cache authenticated HTML, RSC, API or mutations. */
const CACHE = "body-public-offline-v1";
const PREFIX = "body-public-offline-";
const PUBLIC = new Set(["/offline", "/icon.svg"]);
const MAX_BYTES = 32 * 1024;

async function publicResponse(path) {
  const response = await fetch(path, { cache: "reload", credentials: "omit" });
  if (!response.ok || response.redirected || response.type === "opaque")
    throw new Error("Public fallback unavailable");
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("Public asset too large");
  return response;
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // No skipWaiting: never replace a worker underneath an active workout.
      const cache = await caches.open(CACHE);
      for (const path of PUBLIC)
        await cache.put(path, await publicResponse(path));
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PUBLIC.has(url.pathname) && !url.search) {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(request, { cacheName: CACHE });
          if (cached) return cached;
        } catch {
          // Storage can be denied/evicted; online fetch remains available.
        }
        return publicResponse(url.pathname);
      })(),
    );
    return;
  }
  // The public root is a redirect, not an app page. Leave its native redirect
  // entirely untouched: Next's Node adapter emits duplicate Location headers
  // there, which Fetch can combine into a different URL. Installed start_url
  // is /dashboard; offline fallback is deliberately not promised for /.
  if (request.mode !== "navigate" || url.pathname === "/") return;
  event.respondWith(
    (async () => {
      try {
        // Network-only private navigation: never put this response in a cache.
        // Let the browser follow redirects using its original response headers.
        // Following inside fetch can combine duplicate Location headers from
        // the Node adapter into a different URL (including Auth redirects).
        return await fetch(request, { redirect: "manual" });
      } catch {
        let fallback;
        try {
          fallback = await caches.match("/offline", { cacheName: CACHE });
        } catch {
          // The static inline last resort contains no account data.
        }
        return new Response(
          fallback
            ? await fallback.text()
            : '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Body · Offline</title><body><main><h1>Body</h1><p>Connection unavailable. Reconnect to open this page. Unconfirmed changes are not saved.</p><a href="">Try again</a></main></body></html>',
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            },
          },
        );
      }
    })(),
  );
});
