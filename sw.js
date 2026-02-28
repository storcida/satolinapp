/* ═══════════════════════════════════════════════════
   SATOLINAPP · SERVICE WORKER · v0.2.0
   ═══════════════════════════════════════════════════ */

const CACHE_NAME = 'satolinapp-v020';
const STATIC_ASSETS = [
  '/satolinapp/',
  '/satolinapp/index.html',
  '/satolinapp/compras/',
  '/satolinapp/compras/index.html',
  '/satolinapp/finanzas/',
  '/satolinapp/finanzas/index.html',
  '/satolinapp/SATOLINAPP1.svg',
  '/satolinapp/manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap'
];

// Install — cache static assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-only for Supabase API & auth
  if (url.hostname.includes('supabase.co')) return;

  // Network-only for weather API
  if (url.hostname.includes('open-meteo.com')) return;

  // Network-first for HTML pages (get fresh content, fallback to cache)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets (fonts, SVG, CSS, JS)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
