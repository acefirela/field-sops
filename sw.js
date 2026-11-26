// ACE Field SOPs service worker. Built 2046664a3aa6.
const SHELL = "ace-shell-2046664a3aa6";
const AUDIO = "ace-audio-20f2e33153";
const FONTS = "ace-fonts";
const CORE = ["./", "index.html", "data.enc", "access.json", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== AUDIO && k !== FONTS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(/\.(mp3|bin)$/.test(url.pathname) ? audio(req) : networkFirst(req));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
});

// Page, text and crew code: newest copy when there is signal, saved copy when there is none
// (or when the network takes longer than 4 seconds).
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  let saved = await cache.match(req, { ignoreSearch: true });
  if (!saved && req.mode === "navigate") saved = await cache.match("index.html");
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (!saved) return net;
  net.catch(() => {});
  const slow = new Promise((r) => setTimeout(() => r(saved), 4000));
  return Promise.race([net.catch(() => saved), slow]);
}
async function cacheFirst(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}
// Audio: keep every clip that has been played or saved, and answer the player's byte-range
// requests from the saved copy so clips play with no signal.
async function audio(req) {
  const cache = await caches.open(AUDIO);
  let res = await cache.match(req.url);
  if (!res) {
    const net = await fetch(req.url);
    if (!net.ok || net.status !== 200) return net;
    await cache.put(req.url, net.clone());
    res = net;
  }
  const range = req.headers.get("range");
  if (!range) return res;
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = Math.max(0, buf.byteLength - parseInt(m[2], 10)); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + buf.byteLength } });
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: "Partial Content",
    headers: {
      "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      "Content-Range": "bytes " + start + "-" + end + "/" + buf.byteLength
    }
  });
}
