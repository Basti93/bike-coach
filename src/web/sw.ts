/// <reference lib="webworker" />
import { clickTarget, handleFetch, notificationFor, precacheName, routeFor } from './swLogic';

declare const self: ServiceWorkerGlobalScope;

// Both literals are replaced at build time by vite.web.config.ts with the file list and a hash of it.
const PRECACHE = '__PRECACHE_LIST__' as unknown as string[];
const BUILD_ID = '__BUILD_ID__';
const NAME = precacheName(BUILD_ID);
const ALLOW: ReadonlySet<string> = new Set(PRECACHE);

// No skipWaiting here: a new worker waits until the page, with no workout open, asks for it.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
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
  if (routeFor(req, self.location.origin, ALLOW) === 'bypass') return; // API calls and everything else go straight to the network
  e.respondWith(
    caches.open(NAME)
      .then((cache) => handleFetch(req, self.location.origin, ALLOW, { cache, fetch: (u) => fetch(u) }))
      .then((res) => res ?? fetch(r)),
  );
});

// Push: only the two notices of the server (a new version, the meal plan of the week). A tag per type replaces a repeat.
self.addEventListener('push', (e) => {
  let text: string | null = null;
  try { text = e.data?.text() ?? null; } catch { /* plain notice */ }
  const n = notificationFor(text);
  e.waitUntil(self.registration.showNotification(n.title, n.options));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const t = clickTarget(e.notification.data, wins, self.location.origin);
    if ('open' in t) { await self.clients.openWindow(t.open); return; }
    const w = wins[t.focus]!;
    await w.focus();
    if (t.tab) w.postMessage({ type: 'OPEN_TAB', tab: t.tab });
  })());
});
