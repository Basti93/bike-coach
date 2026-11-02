import { describe, expect, it } from 'vitest';
import { routeFor, handleFetch, NEVER_CACHE, precacheName } from '../../src/web/swLogic';
import { setupServiceWorker, shouldActivateNow } from '../../src/web/register';

const ORIGIN = 'https://pf.example';
const req = (path: string, over: Partial<{ method: string; mode: string; origin: string }> = {}) => ({ method: over.method ?? 'GET', url: `${over.origin ?? ORIGIN}${path}`, mode: over.mode ?? 'no-cors' });

function caches() {
  const store = new Map<string, Response>();
  return {
    store,
    cache: { match: async (k: string) => store.get(k)?.clone(), put: async (k: string, r: Response) => { store.set(k, r.clone()); } },
  };
}

describe('service worker routing', () => {
  it('never touches API paths', () => {
    for (const p of NEVER_CACHE) expect(routeFor(req(p), ORIGIN)).toBe('bypass');
    expect(routeFor(req('/records?since=3'), ORIGIN)).toBe('bypass');
    expect(NEVER_CACHE).toEqual(['/records', '/login', '/logout', '/me', '/device-token', '/healthz']);
  });
  it('bypasses POST, other origins and the worker script itself', () => {
    expect(routeFor(req('/assets/a.js', { method: 'POST' }), ORIGIN)).toBe('bypass');
    expect(routeFor(req('/assets/a.js', { origin: 'https://evil.example' }), ORIGIN)).toBe('bypass');
    expect(routeFor(req('/sw.js'), ORIGIN)).toBe('bypass');
  });
  it('index.html and navigations are network first, assets cache first', () => {
    expect(routeFor(req('/', { mode: 'navigate' }), ORIGIN)).toBe('network-first');
    expect(routeFor(req('/index.html'), ORIGIN)).toBe('network-first');
    expect(routeFor(req('/assets/index-abc.js'), ORIGIN)).toBe('cache-first');
  });
  it('network-first serves the network and keeps a copy, and falls back to the cache offline', async () => {
    const { cache, store } = caches();
    const online = await handleFetch(req('/', { mode: 'navigate' }), ORIGIN, { cache, fetch: async () => new Response('new') });
    expect(await online!.text()).toBe('new');
    expect(await store.get('/index.html')!.clone().text()).toBe('new');
    const offline = await handleFetch(req('/', { mode: 'navigate' }), ORIGIN, { cache, fetch: async () => { throw new TypeError('offline'); } });
    expect(await offline!.text()).toBe('new');
  });
  it('cache-first serves the precached asset without the network', async () => {
    const { cache, store } = caches();
    store.set('/assets/a.js', new Response('js'));
    const res = await handleFetch(req('/assets/a.js'), ORIGIN, { cache, fetch: async () => { throw new Error('no network expected'); } });
    expect(await res!.text()).toBe('js');
  });
  it('returns null (browser handles it) for API requests', async () => {
    const { cache } = caches();
    expect(await handleFetch(req('/records'), ORIGIN, { cache, fetch: async () => new Response('x') })).toBeNull();
  });
  it('the cache name depends on the build, so a new build starts a new cache', () => {
    expect(precacheName('a')).not.toBe(precacheName('b'));
  });
});

describe('update decisions', () => {
  it('a waiting worker activates only when no workout is open', () => {
    expect(shouldActivateNow({ waiting: true, workoutOpen: true })).toBe(false);
    expect(shouldActivateNow({ waiting: true, workoutOpen: false })).toBe(true);
    expect(shouldActivateNow({ waiting: false, workoutOpen: false })).toBe(false);
  });

  function harness(open: boolean) {
    const posted: unknown[] = [];
    const listeners: Record<string, () => void> = {};
    const reg = { waiting: { postMessage: (m: unknown) => posted.push(m) } as { postMessage(m: unknown): void } | null, addEventListener: () => {}, update: async () => {} };
    const container = {
      register: async () => reg,
      addEventListener: (t: string, f: () => void) => { listeners[t] = f; },
    };
    let reloads = 0;
    const state = { open };
    return { posted, listeners, reg, container, state, reloads: () => reloads, start: () => setupServiceWorker({ container: container as never, isWorkoutOpen: () => state.open, reload: () => { reloads++; }, url: '/sw.js' }) };
  }

  it('a new service worker waits while a workout is open and activates afterwards', async () => {
    const h = harness(true);
    const sw = await h.start();
    expect(h.posted).toEqual([]);
    h.listeners.controllerchange?.();
    expect(h.reloads()).toBe(0);
    h.state.open = false;
    sw.check(); // also called when a workout is finished
    expect(h.posted).toEqual([{ type: 'SKIP_WAITING' }]);
    h.listeners.controllerchange?.();
    expect(h.reloads()).toBe(1);
  });

  it('a controller change we did not ask for (first install) never reloads, nor does one during a workout', async () => {
    const h = harness(false);
    h.reg.waiting = null;
    await h.start();
    h.listeners.controllerchange?.();
    expect(h.reloads()).toBe(0);
  });
});
