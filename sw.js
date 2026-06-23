/* ============================================================
   FODDEB — Service Worker (sw.js) v2.2.0
   Stratégie : Cache First pour assets, Network First pour HTML
   ─────────────────────────────────────────────────────────────
   CHANGEMENTS v2.2.0 :
   - CACHE_NAME bumpé → force remplacement du cache après déploiement
   - /api/gas ajouté dans BYPASS_PATHS — le proxy Vercel répond en
     POST, déjà ignoré par la garde request.method !== 'GET', mais
     on l'exclut explicitement pour éviter toute interférence future.
   - BYPASS_HOSTNAMES nettoyé — script.google.com retiré car les
     appels GAS passent maintenant par /api/gas (même domaine).
   ============================================================ */

const CACHE_NAME    = 'foddeb-v2.2.0';
const RUNTIME_CACHE = 'foddeb-runtime-v2';

// Fichiers pré-cachés au install — tous doivent exister
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/assets/js/config.js',
  '/assets/js/services/api.js',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
];

// Domaines externes — jamais interceptés
const BYPASS_HOSTNAMES = [
  'fedapay.com',
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'recaptcha.net',
  'www.google.com',
];

// Chemins locaux à ne jamais mettre en cache (dynamiques ou sensibles)
const BYPASS_PATHS = [
  '/api/',      // proxy GAS + futures routes serverless
];

/* ── Install : pré-cache robuste ─────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        // allSettled : un 404 ne bloque pas le reste
        Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

/* ── Activate : purge des anciens caches ─────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch : stratégie hybride ───────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer : non-GET, domaines externes, chemins dynamiques
  if (request.method !== 'GET') return;
  if (BYPASS_HOSTNAMES.some(h => url.hostname.includes(h))) return;
  if (url.hostname !== self.location.hostname) return;
  if (BYPASS_PATHS.some(p => url.pathname.startsWith(p))) return;

  /* Assets statiques → Cache First */
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(css|js|png|jpg|jpeg|svg|webp|woff2?|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            // Cloner avant tout usage — le body ne peut être lu qu'une fois
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, toCache));
          }
          return response;
        });
      })
    );
    return;
  }

  /* Pages HTML → Network First avec fallback cache */
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            // Cloner AVANT tout usage — le body ne peut être consommé qu'une seule fois
            const toCache = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, toCache));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached => cached || caches.match('/index.html'))
        )
    );
    return;
  }
});

/* ── Push notifications ──────────────────────────────────── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'FODDEB', {
      body:  data.body  || '',
      icon:  '/assets/icons/icon-192x192.png',
      badge: '/assets/icons/icon-192x192.png',
      tag:   data.tag   || 'foddeb-notif',
      data:  data.url   || '/',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});
