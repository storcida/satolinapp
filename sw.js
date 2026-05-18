// PEARS · Service Worker v0.5.6
const CACHE = 'pears-v0.5.6';

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Notificar a todas las pestañas para que recarguen
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_ACTIVATED' }));
        });
      })
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isPage = url.pathname.endsWith('.html')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname === '/'
    || url.pathname.endsWith('/');

  if (isPage) {
    // Network-first — nunca devolver undefined
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(cached =>
            cached || new Response('Offline', { status: 503, statusText: 'Offline' })
          )
        )
    );
    return;
  }

  // Cache-first para assets estáticos (fonts, svg, images)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res || new Response('Not found', { status: 404 });
      }).catch(() => new Response('Offline', { status: 503 }));
    })
  );
});
