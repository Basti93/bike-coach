/** A waiting worker takes over only when no workout is open. */
export const shouldActivateNow = (s: { waiting: boolean; workoutOpen: boolean }): boolean => s.waiting && !s.workoutOpen;

type Registration = { waiting: { postMessage(m: unknown): void } | null; addEventListener(t: string, f: () => void): void; update(): Promise<unknown> };
type Container = { register(url: string): Promise<Registration>; addEventListener(t: string, f: () => void): void };

/**
 * Registers the worker from the module bundle. An update waits: `check()` (call it when a workout is finished or the
 * app comes back) activates a waiting worker once no workout is open. Only a change we asked for reloads the page.
 */
export async function setupServiceWorker(o: { container: Container; isWorkoutOpen: () => boolean; reload: () => void; url?: string }) {
  const reg = await o.container.register(o.url ?? '/sw.js');
  let requested = false;
  const check = (): void => {
    if (shouldActivateNow({ waiting: reg.waiting !== null, workoutOpen: o.isWorkoutOpen() })) {
      requested = true;
      reg.waiting!.postMessage({ type: 'SKIP_WAITING' });
    }
  };
  o.container.addEventListener('controllerchange', () => { if (requested && !o.isWorkoutOpen()) o.reload(); });
  reg.addEventListener('updatefound', () => setTimeout(check, 1000));
  check();
  return { check, update: () => reg.update().catch(() => {}) };
}
