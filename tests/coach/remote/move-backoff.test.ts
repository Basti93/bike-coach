import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import type { MigrateResult } from '../../../src/coach/remote/migrate';
import { MoveBackoff } from '../../../src/coach/remote/move-backoff';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** The waits between runs when every run ends with `out`: run as soon as due, checking each minute. */
const waits = (b: MoveBackoff, clock: { now: number }, out: MigrateResult, n: number): number[] => {
  const got: number[] = [];
  let last = clock.now;
  b.record('pa', out);
  for (let i = 0; i < n; i++) {
    while (!b.due('pa', () => true)) clock.now += MIN;
    got.push(clock.now - last);
    last = clock.now;
    b.record('pa', out);
  }
  return got;
};

test('a failure that repeats waits 1, 2, 4, 8 minutes and then 15 at most', () => {
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now);
  expect(b.due('pa', () => true)).toBe(true);
  expect(waits(b, clock, { state: 'failed', reason: 'offline' }, 7)).toEqual([MIN, 2 * MIN, 4 * MIN, 8 * MIN, 15 * MIN, 15 * MIN, 15 * MIN]);
  expect(b.problem('pa')).toBe('offline');
});

test('a paused finish backs off too instead of asking every scan', () => {
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now);
  expect(waits(b, clock, { state: 'paused', reason: 'finish' }, 6)).toEqual([MIN, 2 * MIN, 4 * MIN, 8 * MIN, 15 * MIN, 15 * MIN]);
});

test('another reason starts the wait over', () => {
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now);
  waits(b, clock, { state: 'failed', reason: 'offline' }, 4);
  expect(waits(b, clock, { state: 'paused', reason: 'finish' }, 1)).toEqual([MIN]);
});

test('while records are unsettled only settled() is asked, however much time passes', () => {
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now);
  b.record('pa', { state: 'paused', reason: 'records' });
  const settled = vi.fn(() => false);
  clock.now += 10 * HOUR;
  expect(b.due('pa', settled)).toBe(false);
  expect(settled).toHaveBeenCalledTimes(1);
  settled.mockReturnValue(true);
  expect(b.due('pa', settled)).toBe(true);
});

test('a ride opening needs no wait; done clears everything', () => {
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now);
  b.record('pa', { state: 'failed', reason: 'offline' });
  b.record('pa', { state: 'paused', reason: 'ride' });
  expect(b.due('pa', () => true)).toBe(true);
  b.record('pa', { state: 'failed', reason: 'offline' });
  b.record('pa', { state: 'done' });
  expect(b.due('pa', () => true)).toBe(true);
  expect(b.problem('pa')).toBeNull();
});

test('a refusal that will not go away waits up to six hours and says what it is', () => {
  for (const out of [
    { state: 'failed', reason: 'too-large' },
    { state: 'failed', reason: 'unreadable', items: ['garmin-db'] },
    { state: 'refused', reason: 'other-profile' },
  ] as MigrateResult[]) {
    const clock = { now: 0 };
    const b = new MoveBackoff(() => clock.now);
    const w = waits(b, clock, out, 12);
    expect(w.slice(0, 3)).toEqual([MIN, 2 * MIN, 4 * MIN]);
    expect(Math.max(...w)).toBe(6 * HOUR);
    expect(b.problem('pa')).toBe(out.state === 'refused' ? 'other-profile' : (out as { reason: string }).reason);
  }
});

test('missing for the same items twice is a refusal that waits up to six hours; other items start over', () => {
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now);
  const missing: MigrateResult = { state: 'failed', reason: 'missing', items: ['garmin-db'] };
  const w = waits(b, clock, missing, 12);
  expect(Math.max(...w)).toBe(6 * HOUR);
  expect(b.problem('pa')).toBe('missing');
  expect(waits(b, clock, { state: 'failed', reason: 'missing', items: ['gym-state'] }, 1)).toEqual([MIN]);
  // Once only: an ordinary failure, at most 15 minutes.
  const once = new MoveBackoff(() => clock.now);
  once.record('pa', missing);
  expect(once.problem('pa')).toBe('offline');
});

// ---- Fix round 2 ----

test('a long wait survives a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbo-'));
  const clock = { now: 0 };
  const b = new MoveBackoff(() => clock.now, dir);
  waits(b, clock, { state: 'refused', reason: 'other-profile' }, 10);
  const wait = (x: MoveBackoff) => { let n = 0; while (!x.due('pa', () => true)) { clock.now += MIN; n++; } return n; };
  const again = new MoveBackoff(() => clock.now, dir);
  expect(again.problem('pa')).toBe('other-profile');
  expect(again.due('pa', () => true)).toBe(false);
  expect(wait(again)).toBeGreaterThan(5 * 60);
  // The records gate too.
  const r = new MoveBackoff(() => clock.now, dir);
  r.record('pb', { state: 'paused', reason: 'records' });
  expect(new MoveBackoff(() => clock.now, dir).due('pb', () => false)).toBe(false);
  // Done clears it on disk.
  again.record('pa', { state: 'done' });
  expect(new MoveBackoff(() => clock.now, dir).due('pa', () => true)).toBe(true);
});
