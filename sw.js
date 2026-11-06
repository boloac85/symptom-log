/* Symptom Log service worker: offline app shell + cached fonts. Bump VERSION to ship an update. */
const VERSION = 'v1.0.0';
const SHELL = `shell-${VERSION}`;
const FONTS = 'fonts-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache first, fill on first use
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Pages: network first (quick updates), fall back to the cached shell offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(SHELL); c.put('./index.html', res.clone());
        return res;
      } catch (err) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  // Other same-origin files: cache first, refresh in the background
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(async res => { if (res.ok) (await caches.open(SHELL)).put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })());
});
