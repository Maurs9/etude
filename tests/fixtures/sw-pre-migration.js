/* Étude service worker: keeps the app available offline without pinning anyone to an old version.
   - The page is network-first: whenever the network answers, the fresh copy is shown and stored; the stored copy is used
     only when the network fails or stalls. A new upload is therefore picked up on the next online visit.
   - The manifest and icons come from the cache and are refreshed in the background.
   - Bump VERSION when this file's caching rules change; old caches are removed when the new worker activates. */
'use strict';
const VERSION = 'etude-shell-v2';
const SHELL = 'etude.html';
const ASSETS = ['manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const NETWORK_TIMEOUT_MS = 8000;

const SCOPE = new URL(self.registration.scope);
const SHELL_URL = new URL(SHELL, SCOPE).href;
const ASSET_URLS = new Set(ASSETS.map(u => new URL(u, SCOPE).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 'no-cache' revalidates with the server, so the stored copy is the current one (a 304 costs almost nothing).
    await cache.add(new Request(SHELL_URL, { cache: 'no-cache' }));
    await Promise.all(ASSETS.map(u => cache.add(new Request(new URL(u, SCOPE).href, { cache: 'no-cache' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('etude-') && k !== VERSION).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable(); } catch (_) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin) return;
  const bare = url.origin + url.pathname;
  if (bare === SHELL_URL) { event.respondWith(page(event, true)); return; }
  if (req.mode === 'navigate' && bare === SCOPE.href) { event.respondWith(page(event, false)); return; }
  if (ASSET_URLS.has(bare)) event.respondWith(asset(event, bare));
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)); }

async function page(event, isShell) {
  const cache = await caches.open(VERSION);
  const network = (async () => {
    const res = (event.request.mode === 'navigate' && await event.preloadResponse) || await fetch(event.request);
    if (isShell && res.ok && res.type === 'basic') event.waitUntil(cache.put(SHELL_URL, res.clone()).catch(() => {}));
    return res;
  })();
  event.waitUntil(network.then(() => {}, () => {}));
  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
  } catch (err) {
    const hit = await cache.match(SHELL_URL);
    if (hit) return hit;
    return network;   // nothing stored yet: let the real network result (or error) through
  }
}

async function asset(event, key) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(key);
  const network = fetch(event.request).then(res => {
    if (res.ok) event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  });
  if (hit) { event.waitUntil(network.then(() => {}, () => {})); return hit; }
  return network;
}
