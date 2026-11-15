// The service worker (Task 1.8). What the game has fetched once, it keeps on
// the phone: megabytes are money, and a district visited yesterday must open
// today without paying for it again, or without a network at all.
//
// A file whose name carries the hash of its contents (the build's own files,
// a pack's chunks) never changes, so the copy kept is always right: kept
// first, network only when there is none. Everything else (a page, a
// manifest, a list) is asked of the network first, so that a new version is
// seen at once, and answered from what was kept only when the network fails.

/* global self, caches, fetch, URL, Request, Response, Headers */

const KEPT = "nzila-v1";
const HASHED = /(?:^\/assets\/|\.[0-9a-f]{12}\.)/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== KEPT).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

async function keep(request, response) {
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(KEPT);
    await cache.put(request, response.clone());
  }
  return response;
}

/** What is answered from the phone's own store says so, so that the data meter counts it as costing nothing. */
function marked(kept) {
  const headers = new Headers(kept.headers);
  headers.set("x-nzila-kept", "1");
  return new Response(kept.body, { status: kept.status, statusText: kept.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // What the API answers is a player's own and is never kept here (docs/SECURITY.md).
  if (url.pathname.startsWith("/api/")) return;
  if (HASHED.test(url.pathname)) {
    event.respondWith(caches.match(request).then((kept) => (kept ? marked(kept) : fetch(request).then((response) => keep(request, response)))));
    return;
  }
  // A page asked for by its address is the one page the game is: kept under "/" when the network is gone.
  const asked = request.mode === "navigate" ? new Request("/") : request;
  event.respondWith(
    fetch(request)
      .then((response) => keep(asked, response))
      .catch(() => caches.match(asked).then((kept) => (kept ? marked(kept) : Response.error()))),
  );
});
