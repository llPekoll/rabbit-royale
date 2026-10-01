/**
 * Rabbit Royale service worker — a navigation-only offline fallback, and
 * nothing else. Registered in production by install-guide.tsx.
 *
 * NOTHING here caches a response. The game is live state: a cached burrow, a
 * cached balance or a cached board is a bug with real carrots (and real money,
 * in the shop) behind it. The only thing precached is a static offline page,
 * and the only request the fetch handler ever answers is a top-level
 * navigation that FAILED to reach the network. Every API call, asset and
 * socket goes straight to the network, untouched.
 *
 * Why a fetch handler at all: it is part of Chromium's install-prompt criteria
 * on some versions and platforms (the Domin8 hub measured Chrome 140 desktop
 * firing `beforeinstallprompt` without one; Android was never verified). It
 * costs nothing and buys a real offline page. Same design as the hub's sw.js.
 */

/** Bump the version to re-precache the offline page. */
const OFFLINE_CACHE = 'rr-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      // A failed precache must never block activation.
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Top-level navigations only, network-first, never written back. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
});
