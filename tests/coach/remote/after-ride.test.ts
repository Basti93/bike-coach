import { expect, test, vi } from 'vitest';
import { afterRideJob, type AfterRideDeps } from '../../../src/coach/remote/after-ride';
import type { MigrateResult } from '../../../src/coach/remote/migrate';
import { MoveBackoff } from '../../../src/coach/remote/move-backoff';

const MIN = 60_000;

const world = (o: { moved?: string[]; linked?: string[]; outs?: MigrateResult[] } = {}) => {
  const w = { now: 0, ride: false, settled: true, moved: new Set(o.moved ?? []), outs: [...(o.outs ?? [])] };
  const backoff = new MoveBackoff(() => w.now);
  const move = vi.fn(async (id: string): Promise<MigrateResult> => {
    const out = w.outs.shift() ?? { state: 'done' };
    if (out.state === 'done') w.moved.add(id);
    return out;
  });
  const tick = vi.fn(async (_id: string) => {});
  const meals = vi.fn(async () => false);
  const settled = vi.fn((_id: string) => w.settled);
  const deps: AfterRideDeps = {
    profileIds: () => ['pa', 'pb'],
    noOpenRide: () => !w.ride,
    onServer: (id) => w.moved.has(id),
    linked: (id) => (o.linked ?? ['pa']).includes(id),
    settled, backoff, uploads: { tick }, move, meals,
  };
  return { w, deps, move, tick, meals, settled };
};

test('a linked profile moves; a moved one uploads its rides; an unlinked one is left alone', async () => {
  const t = world({ moved: ['pb'], linked: ['pa'] });
  await afterRideJob(t.deps);
  expect(t.move.mock.calls.map((c) => c[0])).toEqual(['pa']);
  expect(t.tick.mock.calls.map((c) => c[0])).toEqual(['pb']);
  expect(t.meals).toHaveBeenCalledTimes(1);
});

test('after a failure the move waits for the backoff', async () => {
  const t = world({ outs: [{ state: 'failed', reason: 'offline' }, { state: 'failed', reason: 'offline' }] });
  await afterRideJob(t.deps);
  t.w.now += 30_000;
  await afterRideJob(t.deps);
  expect(t.move).toHaveBeenCalledTimes(1);
  t.w.now += 31_000;
  await afterRideJob(t.deps);
  expect(t.move).toHaveBeenCalledTimes(2);
  // Now two minutes.
  t.w.now += MIN;
  await afterRideJob(t.deps);
  expect(t.move).toHaveBeenCalledTimes(2);
});

test('while records are unsettled only settled() is asked, never the move', async () => {
  const t = world({ outs: [{ state: 'paused', reason: 'records' }] });
  await afterRideJob(t.deps);
  t.w.settled = false;
  for (let i = 0; i < 5; i++) { t.w.now += 10 * MIN; await afterRideJob(t.deps); }
  expect(t.move).toHaveBeenCalledTimes(1);
  expect(t.settled).toHaveBeenCalled();
  t.w.settled = true;
  await afterRideJob(t.deps);
  expect(t.move).toHaveBeenCalledTimes(2);
});

test('nothing runs with a ride open', async () => {
  const t = world({ moved: ['pb'] });
  t.w.ride = true;
  await afterRideJob(t.deps);
  expect(t.move).not.toHaveBeenCalled();
  expect(t.tick).not.toHaveBeenCalled();
  expect(t.meals).not.toHaveBeenCalled();
});
