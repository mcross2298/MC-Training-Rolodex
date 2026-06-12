/* ═══════════════════════════════════════════════════════════════════
   sw.js  —  MC Training App Service Worker
   Strategy: Cache-first for assets, network-first for data.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'mc-training-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/base.css',
  '/mc-nav.css',
  '/mc-card-actions.css',
  '/exercisedata.json',
  '/program-overrides.json',
  '/content-manifest.json',
  // JS engine
  '/mc-session.js',
  '/mc-finish.js',
  '/mc-summary.js',
  '/mc-stats.js',
  '/mc-replace.js',
  '/mc-suggest.js',
  '/mc-account.js',
  '/mc-body.js',
  '/mc-cond.js',
  '/mc-wrapped.js',
  '/mc-exercise-trends.js',
  '/mc-backup-status.js',
  '/mc-program-pub.js',
  '/program-manager.js',
  // pages
  '/cat-mc.html',
  '/cat-pmc.html',
  '/cat-custom.html',
  '/mc-split2.html',
  '/mc-split3.html',
  '/mc-s1-legs.html',
  '/mc-s5-pull.html',
  '/mc-instructions.html',
  '/import.html',
  '/pmc-s2-cst.html',
  '/pmc-s4-legs-back.html',
  '/pmc-s5-push.html',
  '/pmc-s6-legs.html',
  '/pmc-legs-hams.html',
  '/pmc-workout.html',
  '/conditioning-timer.html',
  '/driveway-demolition.html',
  '/battle-ropes.html',
  '/quick-tour-overview.html',
];

/* ── install: pre-cache static assets ───────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ── activate: purge old caches ─────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── fetch: cache-first with network fallback ────────────────────── */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // skip cross-origin
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

/* ── message: force update ───────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
