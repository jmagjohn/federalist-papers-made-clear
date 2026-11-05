/* The Federalist, Made Clear — service worker
 *
 * Goals: make the site installable, make it open instantly, and let people keep
 * reading papers they have already opened when they have no signal.
 *
 * - Pages: network first (so people always get the newest text), falling back to
 *   whatever was saved the last time they opened that page, then to /offline/.
 * - Versioned CSS/JS (?v=...): cache first, since a new build changes the URL.
 * - Data files (search index, etc.): network first, saved for offline search.
 * - Google Fonts: saved after first use so the typefaces survive offline.
 *
 * The build stamps a version into VERSION below, so every deploy gets a fresh cache
 * and old ones are deleted.
 */
const VERSION = '__BUILD_ID__';
const CACHE = 'fmc-' + VERSION;
const NAV_TIMEOUT_MS = 5000;

// Small app shell, saved at install time. Papers are saved as they are read.
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Save each file separately so one failure doesn't block the install.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fmc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const cacheable = (res) => res && res.ok && res.type !== 'opaqueredirect' && !res.redirected;

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function networkFirst(request, { timeout, fallbackUrl, ignoreSearch }) {
  const cache = await caches.open(CACHE);
  try {
    const res = timeout ? await fetchWithTimeout(request, timeout) : await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: !!ignoreSearch });
    if (hit) return hit;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) cache.put(request, res.clone());
  return res;
}

// Google Fonts: stylesheet is revalidated in the background, font files never change.
async function fontStylesheet(event) {
  const request = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url);
  const refresh = fetch(request.url, { mode: 'cors', credentials: 'omit' })
    .then((res) => {
      if (res.ok) cache.put(request.url, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(fontStylesheet(event));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // The service worker file itself must always come from the network.
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, { timeout: NAV_TIMEOUT_MS, fallbackUrl: '/offline/', ignoreSearch: true }));
    return;
  }

  if (url.searchParams.has('v')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, {}));
});
