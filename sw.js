/* Service worker del Tablero TM Boxing.
   - La API (script.google.com) SIEMPRE va a la red, nunca se cachea.
   - index.html va a la red primero (para recibir actualizaciones) con caché de respaldo.
   - El resto (íconos, manifest) se sirve de caché. */
const CACHE = 'tablero-tmb-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) return;

  if (e.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(m => m || fetch(e.request).then(r => {
      if (url.origin === location.origin && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }))
  );
});
