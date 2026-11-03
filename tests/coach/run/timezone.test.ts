import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunCoach } from '../../../src/coach/run/run-coach';
import { weekDates } from '../../../src/coach/run/rules';
import { RecordStore } from '../../../src/coach/tracking/store';
import { weekOf } from '../../../src/shared/meals';
import type { Profile } from '../../../src/shared/profiles';

// Run weeks and the Sunday 18:00 horizon follow the process time zone (`TZ`, set in the coach container). Node reads a
// changed process.env.TZ at once, so each case sets it and the original is restored afterwards.
const DAY_MS = 86_400_000;
const original = process.env.TZ;
const restore = (): void => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; };
const inZone = <T>(tz: string, f: () => T): T => {
  process.env.TZ = tz;
  try { return f(); } finally { restore(); }
};
const inZoneAsync = async <T>(tz: string, f: () => Promise<T>): Promise<T> => {
  process.env.TZ = tz;
  try { return await f(); } finally { restore(); }
};
afterAll(restore);

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tz-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('the week of an instant follows the process time zone; weekDates is the same seven dates in every zone', () => {
  // Monday 2 November 2026, 00:30 in Berlin, still Sunday in UTC and in New York.
  const ms = Date.UTC(2026, 9, 31, 23, 30) + DAY_MS;
  expect(inZone('Europe/Berlin', () => weekOf(ms))).toBe('2026-11-02');
  expect(inZone('UTC', () => weekOf(ms))).toBe('2026-10-26');
  expect(inZone('America/New_York', () => weekOf(ms))).toBe('2026-10-26');
  const dates = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
  // Berlin and New York change the clocks in this week; Santiago changes at midnight.
  for (const tz of ['Europe/Berlin', 'UTC', 'America/New_York', 'America/Santiago', 'Pacific/Auckland']) expect(inZone(tz, () => weekDates('2026-10-26'))).toEqual(dates);
});

test('Sunday 18:00 is local to the process time zone', async () => {
  // Sunday 8 November 2026, 17:30 UTC: 18:30 in Berlin, 17:30 in UTC, 12:30 in New York.
  const now = Date.UTC(2026, 10, 8, 17, 30);
  const nextWeekPlanned = (tz: string) => inZoneAsync(tz, async () => {
    const store = new RecordStore({ dir: path.join(dir, tz.replace('/', '-'), 'tracking') });
    store.put('pa', { kind: 'run', id: 'settings', updatedMs: now - 7 * DAY_MS, deleted: false, body: { type: 'settings', on: true, weekdays: [0, 2, 4, 6], answers: null } });
    const coach = new RunCoach({
      dir: path.join(dir, tz.replace('/', '-'), 'run'), store, nowMs: () => now, ask: async () => { throw new Error('no Claude'); }, noOpenRide: () => true,
      profile: (id) => ({ id, name: 'A', ftpW: 200 }) as Profile,
      garminDb: () => ({ runs: () => [], activityFile: () => null, body: () => null }),
      days: (_id, dates) => Object.fromEntries(dates.map((d) => [d, { date: d, hardness: null, legs: false, minutes: 0 }])),
      weeks: () => [], complaints: () => [], garmin: () => ({ connected: false, capable: false }),
    });
    await coach.tick('pa');
    return store.all('pa', 'run').some((r) => r.id === 'week-2026-11-09' && !r.deleted);
  });
  expect(await nextWeekPlanned('Europe/Berlin')).toBe(true);
  expect(await nextWeekPlanned('UTC')).toBe(false);
  expect(await nextWeekPlanned('America/New_York')).toBe(false);
});
