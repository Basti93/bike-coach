/** Pure decisions of the service worker, so they can be tested without a browser. */
export const NEVER_CACHE = ['/records', '/login', '/logout', '/me', '/device-token', '/healthz'];
/** shell: the app page. precached: a file of this build. bypass: not ours, the browser decides. */
export type Route = 'bypass' | 'shell' | 'precached';
type Req = { method: string; url: string; mode: string };
type CacheLike = { match(k: string): Promise<Response | undefined> };

export const precacheName = (buildId: string): string => `pandafit-${buildId}`;

/**
 * An allowlist: only files of this build's precache are ever answered. Nothing is written at runtime, so nothing
 * can poison the cache (a PNG opened as a page, an error page, a file of another version).
 */
export function routeFor(r: Req, origin: string, allow: ReadonlySet<string>): Route {
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== origin) return 'bypass';
  if (NEVER_CACHE.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) return 'bypass';
  if (r.mode === 'navigate' && (u.pathname === '/' || u.pathname === '/index.html')) return 'shell';
  return allow.has(u.pathname) ? 'precached' : 'bypass';
}

/** Null means: not ours, let the browser do it. The cache is this build's own; a miss goes to the network and is not stored. */
export async function handleFetch(r: Req, origin: string, allow: ReadonlySet<string>, deps: { cache: CacheLike; fetch: (u: string) => Promise<Response> }): Promise<Response | null> {
  const route = routeFor(r, origin, allow);
  if (route === 'bypass') return null;
  const key = route === 'shell' ? '/index.html' : new URL(r.url).pathname;
  return (await deps.cache.match(key)) ?? deps.fetch(r.url);
}
