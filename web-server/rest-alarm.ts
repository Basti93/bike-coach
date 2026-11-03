/** One pending rest-end alarm per push endpoint, in memory only (a server restart losing it is fine). */
export const REST_MAX_AHEAD_MS = 15 * 60_000;

export type RestAlarms = {
  /** False (and nothing changes) when the time is not in (now, now + 15 min]. A new alarm replaces the old one of the endpoint. */
  set(endpoint: string, atMs: number): boolean;
  cancel(endpoint: string): void;
  clearAll(): void;
};

export function createRestAlarms(o: {
  now: () => number;
  fire: (endpoint: string) => void | Promise<void>;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}): RestAlarms {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const st = (fn: () => void, ms: number) => (o.setTimeout ?? globalThis.setTimeout)(fn, ms);
  const ct = (h: ReturnType<typeof setTimeout>) => (o.clearTimeout ?? globalThis.clearTimeout)(h);
  const cancel = (endpoint: string) => {
    const h = pending.get(endpoint);
    if (h !== undefined) { ct(h); pending.delete(endpoint); }
  };
  return {
    set(endpoint, atMs) {
      const t = o.now();
      if (!Number.isFinite(atMs) || !(atMs > t) || atMs > t + REST_MAX_AHEAD_MS) return false;
      cancel(endpoint);
      const h = st(() => {
        pending.delete(endpoint);
        void Promise.resolve(o.fire(endpoint)).catch(() => undefined);
      }, atMs - t);
      (h as { unref?: () => void })?.unref?.();
      pending.set(endpoint, h);
      return true;
    },
    cancel,
    clearAll() { for (const h of pending.values()) ct(h); pending.clear(); },
  };
}
