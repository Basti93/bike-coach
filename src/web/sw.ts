/// <reference lib="webworker" />
import { handleFetch, precacheName, routeFor } from './swLogic';

declare const self: ServiceWorkerGlobalScope;

// Both literals are replaced at build time by vite.web.config.ts with the file list and a hash of it.
const PRECACHE = '__PRECACHE_LIST__' as unknown as string[];
const BUILD_ID = '__BUILD_ID__';
const NAME = precacheName(BUILD_ID);

// No skipWaiting here: a new worker waits until the page, with no workout open, asks for it.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(PRECACHE)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('pandafit-') && k !== NAME) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  if ((e.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const req = { method: r.method, url: r.url, mode: r.mode };
  if (routeFor(req, self.location.origin) === 'bypass') return; // API calls and everything else go straight to the network
  e.respondWith(
    caches.open(NAME)
      .then((cache) => handleFetch(req, self.location.origin, { cache, fetch: (u) => fetch(u) }))
      .then((res) => res ?? fetch(r)),
  );
});
