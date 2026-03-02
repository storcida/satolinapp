// ============================================
// SATOLINA · Service Worker v1.1.0
// ============================================
const CACHE = 'satolina-v1.1.0';

const STATIC = [
  '/',
  '/index.html',
  '/compras/',
  '/compras/index.html',
  '/compras/app.js',
  '/finanzas/',
  '/finanzas/index.html',
];

// ── INSTALL: cachear lo que esté disponible, sin fallar si algo no existe ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(
        STATIC.map(url =>
          cache.add(url).catch(() => {
            console.warn('[SW] No se pudo cachear:', url);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network first, caché como fallback ──
self.addEventListener('fetch', e => {
  // Solo manejar GET del mismo origen
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Guardar copia fresca en caché
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
