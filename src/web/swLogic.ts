/** Pure decisions of the service worker, so they can be tested without a browser. */
export const NEVER_CACHE = ['/records', '/login', '/logout', '/me', '/device-token', '/healthz'];
export type Route = 'bypass' | 'network-first' | 'cache-first';
type Req = { method: string; url: string; mode: string };
type CacheLike = { match(k: string): Promise<Response | undefined>; put(k: string, r: Response): Promise<void> };

export const precacheName = (buildId: string): string => `pandafit-${buildId}`;

export function routeFor(r: Req, origin: string): Route {
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== origin) return 'bypass';
  if (NEVER_CACHE.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) return 'bypass';
  if (u.pathname === '/sw.js') return 'bypass';
  if (r.mode === 'navigate' || u.pathname === '/' || u.pathname === '/index.html') return 'network-first';
  return 'cache-first';
}

/** Null means: not ours, let the browser do it. */
export async function handleFetch(r: Req, origin: string, deps: { cache: CacheLike; fetch: (u: string) => Promise<Response> }): Promise<Response | null> {
  const route = routeFor(r, origin);
  if (route === 'bypass') return null;
  const path = new URL(r.url).pathname;
  if (route === 'network-first') {
    try {
      const res = await deps.fetch(r.url);
      if (res.ok) await deps.cache.put('/index.html', res.clone());
      return res;
    } catch (e) {
      const have = await deps.cache.match('/index.html');
      if (have) return have;
      throw e;
    }
  }
  const have = await deps.cache.match(path);
  if (have) return have;
  const res = await deps.fetch(r.url);
  if (res.ok) await deps.cache.put(path, res.clone());
  return res;
}
