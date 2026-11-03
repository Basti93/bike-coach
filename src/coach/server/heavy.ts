/**
 * One heavy run (a Claude call) at a time across every coach of the household, first in, first out.
 * Busy while one runs or waits, so the Hevy and Garmin syncs stay out of Claude runs.
 */
export class HeavyLock {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  busy(): boolean { return this.pending > 0; }

  run<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(() => fn());
    const done = (): void => { this.pending--; };
    // The next call waits for this one to end, whether it succeeded or not.
    this.tail = result.then(done, done);
    return result;
  }
}

/** True from `fromHour` up to, not including, `toHour`, in the process's local time (the container's TZ). A window over midnight works too. */
export const inQuietHours = (nowMs: number, fromHour = 2, toHour = 6): boolean => {
  const h = new Date(nowMs).getHours();
  return fromHour <= toHour ? h >= fromHour && h < toHour : h >= fromHour || h < toHour;
};
