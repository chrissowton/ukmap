/* Which Countries? offline support.
   The site's own files and its data are kept in the browser after the first visit, so it opens quickly and works
   without internet. Each visit checks for newer files in the background ("stale while revalidate").
   Change VERSION when you upload a new release, so old copies are cleared. */
const VERSION = "wp-v1";
const CORE = ["./", "index.html", "style.css", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // live feeds (earthquakes, alerts) are never kept
  if (/usgs\.gov|gdacs\.org/.test(url.hostname)) return;
  const sameSite = url.origin === location.origin;
  const library = /cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname);
  if (!sameSite && !library) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === "navigate" ? cache.match("index.html") : Response.error());
  }));
});
