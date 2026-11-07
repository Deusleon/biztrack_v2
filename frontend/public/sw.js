/*
 * BizTrack service worker.
 *
 * It keeps the app's OWN screens (the page shell, its scripts, styles and icons) so BizTrack
 * opens like an installed app and gets through a flaky connection. It never stores business data:
 *
 *   - the API, and anything not served from this site's own address, bypasses it completely;
 *   - only successful, same-origin responses that are not marked "no-store" are kept;
 *   - the User Guide PDF is always fetched fresh.
 *
 * Pages are loaded network-first, so a new release is picked up as soon as you are online. The
 * app tells the person a new version is ready, and swaps to it only when they choose to reload,
 * never in the middle of a task (the page sends SKIP_WAITING).
 *
 * __BUILD_ID__ is replaced at build time (vite.config.js), so every release changes this file
 * and the browser notices there is something new.
 */
const BUILD = '__BUILD_ID__';
const SHELL_CACHE = `biztrack-shell-${BUILD}`;
const ASSET_CACHE = 'biztrack-assets';           // hashed build files: safe to keep across releases
const MAX_ASSETS = 200;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.ico', '/icon-192.png'];

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BizTrack is offline</title>
<body style="font-family:sans-serif;text-align:center;padding:15vh 24px;color:#1f2937"><h1 style="color:#0A3C8C">You are offline</h1>
<p>BizTrack needs an internet connection to load your business data. Check your connection, then reload.</p></body>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('biztrack-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const cacheable = (res) => res && res.status === 200 && res.type === 'basic' && !/no-store/i.test(res.headers.get('cache-control') || '');

async function prune(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i += 1) await cache.delete(keys[i]); // oldest first
}

async function pageNetworkFirst(request) {
  try {
    const fresh = await fetch(request);
    // keep the shell current whenever the home page loads fine
    if (new URL(request.url).pathname === '/' && cacheable(fresh)) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/', fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match('/', { cacheName: SHELL_CACHE });
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (cacheable(fresh)) { await cache.put(request, fresh.clone()); prune(cache); }
  return fresh;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => { if (cacheable(res)) cache.put(request, res.clone()); return res; }).catch(() => hit);
  return hit || refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;               // the API, fonts and everything off-site
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/docs/') || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') { event.respondWith(pageNetworkFirst(request)); return; }
  if (url.pathname.startsWith('/assets/')) { event.respondWith(assetCacheFirst(request)); return; }
  event.respondWith(staleWhileRevalidate(request));
});
