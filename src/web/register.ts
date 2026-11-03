/** Whether a workout is open on this device. Unknown until the page has read its data once. */
export type OpenState = 'unknown' | 'open' | 'none';

/**
 * A waiting worker takes over when we know that no workout is open, or right after a cold start before the first tap:
 * then everything is in IndexedDB and nothing is held in memory, so a reload loses nothing.
 */
export const shouldActivateNow = (s: { waiting: boolean; workout: OpenState; fresh?: boolean }): boolean =>
  s.waiting && (s.workout === 'none' || (s.workout === 'open' && s.fresh === true));

type Worker = { state: string; addEventListener(t: string, f: () => void): void };
type Registration = { waiting: { postMessage(m: unknown): void } | null; installing?: Worker | null; addEventListener(t: string, f: () => void): void; update(): Promise<unknown> };
type Container = { controller?: unknown; register(url: string): Promise<Registration>; addEventListener(t: string, f: () => void): void };

/**
 * Registers the worker from the module bundle. An update waits: `check()` (call it when a workout is finished or the
 * app comes back) activates a waiting worker once no workout is open. Only a change we asked for reloads the page.
 */
export async function setupServiceWorker(o: { container: Container; isWorkoutOpen: () => OpenState; isFresh?: () => boolean; reload: () => void; url?: string }) {
  const fresh = (): boolean => o.isFresh?.() === true;
  const reg = await o.container.register(o.url ?? '/sw.js');
  let requested = false;
  const check = (): void => {
    // Without a controller this is the first install, which activates by itself and is no update.
    if (o.container.controller && shouldActivateNow({ waiting: reg.waiting !== null, workout: o.isWorkoutOpen(), fresh: fresh() })) {
      requested = true;
      reg.waiting!.postMessage({ type: 'SKIP_WAITING' });
    }
  };
  o.container.addEventListener('controllerchange', () => { if (requested && (o.isWorkoutOpen() === 'none' || (o.isWorkoutOpen() === 'open' && fresh()))) o.reload(); });
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
  });
  check();
  return { check, update: () => reg.update().catch(() => {}) };
}
