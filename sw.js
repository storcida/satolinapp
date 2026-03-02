// ============================================
// SATOLINA · Service Worker v2.0.1
// Network-only for HTML/JS, cache for assets
// ============================================
const CACHE = 'satolina-v2.0.1';

// ── INSTALL: skip waiting immediately ──
self.addEventListener('install', () => self.skipWaiting());

// ── ACTIVATE: nuke ALL old caches, claim clients ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first, cache only static assets ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // For HTML and JS: always go to network, no cache
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname === '/' || url.pathname.endsWith('/')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // For everything else (fonts, svg, images): cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
