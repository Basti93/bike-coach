import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { RunCoach, type RunDeps } from '../../../src/coach/run/run-coach';
import { RecordStore } from '../../../src/coach/tracking/store';
import type { GarminRun } from '../../../src/coach/garmin-db';
import type { Complaint } from '../../../src/coach/motivation';
import type { DayRating } from '../../../src/coach/day-load';
import type { Profile } from '../../../src/shared/profiles';
import { readRunBody, type RunReviewBody, type RunSettingsBody, type RunStatusBody, type RunWeekBody } from '../../../src/shared/run';
import type { TrackedRecord } from '../../../src/shared/records';
import { initialRunCache, loadRunCache, saveRunCache } from '../../../src/coach/run/state';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 2 November 2026, local time. */
const at = (day: number, hour = 9, minute = 0): number => new Date(2026, 10, 2 + day, hour, minute).getTime();
const W0 = '2026-11-02';
const W1 = '2026-11-09';

let dir: string;
let store: RecordStore;
let now: number;
let open: boolean;
let garmin: GarminRun[] | null;
let complaints: Complaint[];
let ask: ReturnType<typeof vi.fn>;

const run = (id: string, startMs: number, minutes = 30, km = 5): GarminRun => ({
  id, type: 'running', startMs, durationS: minutes * 60, distanceM: km * 1000, avgHr: null, maxHr: null, elevationGainM: null,
});
const days = (_id: string, dates: string[]): Record<string, DayRating> => Object.fromEntries(dates.map((d) => [d, { date: d, hardness: null, legs: false, minutes: 0 }]));

const make = (over: Partial<RunDeps> = {}): RunCoach => new RunCoach({
  dir: path.join(dir, 'run'), store, nowMs: () => now, ask: ask as RunDeps['ask'], noOpenRide: () => open,
  profile: (id) => (id === 'pa' ? ({ id: 'pa', name: 'A', ftpW: 200 } as Profile) : null),
  garminDb: () => (garmin === null ? null : { runs: (fromMs: number) => garmin!.filter((r) => r.startMs >= fromMs), activityFile: () => null, body: () => null }),
  days, weeks: () => [], complaints: () => complaints,
  garmin: () => ({ connected: false, capable: false }),
  ...over,
});

const settings = (body: Partial<RunSettingsBody>, updatedMs = now): void => {
  store.put('pa', { kind: 'run', id: 'settings', updatedMs, deleted: false, body: { type: 'settings', on: true, weekdays: null, answers: null, ...body } });
};
const rec = (id: string): TrackedRecord | undefined => store.all('pa', 'run').find((r) => r.id === id);
const week = (w: string): RunWeekBody | null => { const r = rec(`week-${w}`); return r && !r.deleted ? readRunBody(r.body) as RunWeekBody : null; };
const status = (): RunStatusBody | null => { const r = rec('status'); return r && !r.deleted ? readRunBody(r.body) as RunStatusBody : null; };
/** Claude gives back the rule week it was shown, with its own reason. */
const echo = (reason = 'Ruhig weiter.') => async (input: { prompt: string }) => {
  const m = /<regelwoche-nur-daten>\n(.*)\n<\/regelwoche-nur-daten>/.exec(input.prompt);
  const rule = JSON.parse(m![1]!) as { runs: { date: string; kind: string; minutes: number }[] };
  return { runs: rule.runs, reason };
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runcoach-'));
  store = new RecordStore({ dir: path.join(dir, 'tracking') });
  now = at(2);
  open = true;
  garmin = [];
  complaints = [];
  ask = vi.fn(echo());
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('without Garmin and without a settings record nothing is written and nothing is asked', async () => {
  garmin = null;
  await make().tick('pa');
  expect(store.all('pa', 'run')).toEqual([]);
  expect(ask).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(dir, 'run'))).toBe(false);
});

test('Garmin runs in the last 8 weeks write a status record with suggest true and no week', async () => {
  garmin = [run('g1', at(-20))];
  await make().tick('pa');
  expect(status()).toMatchObject({ on: false, suggest: true });
  expect(store.all('pa', 'run').filter((r) => r.id.startsWith('week-'))).toEqual([]);
  expect(ask).not.toHaveBeenCalled();
  // Runs older than 8 weeks suggest nothing.
  garmin = [run('g1', at(-60))];
  store = new RecordStore({ dir: path.join(dir, 'tracking2') });
  await make().tick('pa');
  expect(store.all('pa', 'run')).toEqual([]);
});

test('a settings record with on false removes the status record (tombstone) and plans nothing', async () => {
  garmin = [run('g1', at(-20))];
  const coach = make();
  await coach.tick('pa');
  expect(status()).not.toBeNull();
  settings({ on: false });
  now += HOUR;
  await coach.tick('pa');
  expect(rec('status')?.deleted).toBe(true);
  expect(store.all('pa', 'run').filter((r) => r.id.startsWith('week-'))).toEqual([]);
  expect(ask).not.toHaveBeenCalled();
});

test("switching on plans the rest of the current week from today with announce false; Claude's checked answer replaces the rule plan with source claude", async () => {
  settings({ weekdays: [0, 2, 4, 6] });
  await make().tick('pa');
  const w = week(W0)!;
  expect(w.announce).toBe(false);
  expect(w.runs.length).toBeGreaterThan(0);
  expect(w.runs.every((r) => r.date >= '2026-11-04')).toBe(true);
  expect(w.source).toBe('claude');
  expect(w.reason).toBe('Ruhig weiter.');
  expect(w.runs.every((r) => r.fp === JSON.stringify([r.date, r.kind, r.minutes, r.hrCap]) && r.done === null)).toBe(true);
  expect(w.garmin).toBeNull();
  expect(week(W1)).toBeNull();
  expect(status()).toMatchObject({ on: true, suggest: false });
});

test('Claude unavailable or refused twice: the rule plan stands with source rules', async () => {
  settings({ weekdays: [0, 2, 4, 6] });
  ask = vi.fn(async () => { throw new Error('not there'); });
  await make().tick('pa');
  expect(week(W0)).toMatchObject({ source: 'rules' });
  expect(week(W0)!.runs.length).toBeGreaterThan(0);

  store = new RecordStore({ dir: path.join(dir, 'tracking2') });
  settings({ weekdays: [0, 2, 4, 6] });
  ask = vi.fn(async () => ({ runs: [], reason: 'Weniger.' }));
  const second = make({ dir: path.join(dir, 'run2') });
  await second.tick('pa');
  expect(ask).toHaveBeenCalledTimes(2);
  expect(ask.mock.calls[1]![0].prompt).toContain('ablehnung-nur-daten');
  expect(week(W0)).toMatchObject({ source: 'rules' });
  // Settled: the next tick asks nothing more.
  now += HOUR;
  await second.tick('pa');
  expect(ask).toHaveBeenCalledTimes(2);
});

test('a failed ask is tried again after 10 minutes, at most three times', async () => {
  settings({ weekdays: [0, 2, 4, 6] });
  ask = vi.fn(async () => { throw new Error('not there'); });
  const coach = make();
  await coach.tick('pa');
  now += 5 * 60_000;
  await coach.tick('pa');
  expect(ask).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 4; i++) { now += 11 * 60_000; await coach.tick('pa'); }
  expect(ask).toHaveBeenCalledTimes(3);
  expect(week(W0)).toMatchObject({ source: 'rules' });
});

test('on Sunday at 18:00 the next week is planned with announce true; at 17:59 it is not', async () => {
  settings({ weekdays: [0, 2, 4, 6] }, at(0));
  now = at(6, 17, 59);
  const coach = make();
  await coach.tick('pa');
  expect(week(W1)).toBeNull();
  now = at(6, 18, 0);
  await coach.tick('pa');
  expect(week(W1)).toMatchObject({ announce: true, week: W1 });
  expect(week(W1)!.runs.map((r) => r.date).every((d) => d >= W1)).toBe(true);
});

test('on with no runs and no answers: status needsAnswers true and a default plan', async () => {
  now = at(0);
  settings({});
  await make().tick('pa');
  expect(status()).toMatchObject({ on: true, needsAnswers: true, suggestedDays: [1, 3, 5] });
  expect(week(W0)!.runs.map((r) => [r.date, r.minutes])).toEqual([['2026-11-03', 20], ['2026-11-05', 20]]);
  // With answers there is nothing more to ask.
  settings({ answers: { runsPerWeek: 2, usualMinutes: 25, pain: false } }, now + 1);
  await make().tick('pa');
  expect(status()!.needsAnswers).toBe(false);
});

test('a missed run replans the rest of the week without adding its minutes', async () => {
  now = at(0);
  settings({ weekdays: [0, 2, 4], answers: { runsPerWeek: 3, usualMinutes: 30, pain: false } });
  const coach = make();
  await coach.tick('pa');
  const before = week(W0)!;
  expect(before.runs.map((r) => r.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
  const perRun = before.runs[2]!.minutes;
  now = at(3);
  await coach.tick('pa');
  const after = week(W0)!;
  // Monday and Wednesday stay as they were; Friday gets no more than it had.
  expect(after.runs.slice(0, 2)).toEqual(before.runs.slice(0, 2));
  expect(after.runs.filter((r) => r.date > '2026-11-05').reduce((a, r) => a + r.minutes, 0)).toBeLessThanOrEqual(perRun);
  expect(ask).toHaveBeenCalledTimes(2);
});

test('a complaint change replans; an active knee complaint leaves no runs and the status says pause', async () => {
  settings({ weekdays: [0, 2, 4, 6] });
  const coach = make();
  await coach.tick('pa');
  expect(week(W0)!.runs.length).toBeGreaterThan(0);
  complaints = [{ id: 'c1', text: 'Das Knie zieht', status: 'active', startedMs: now, updatedMs: now }];
  now += HOUR;
  await coach.tick('pa');
  expect(week(W0)!.runs.filter((r) => r.date >= '2026-11-04')).toEqual([]);
  expect(status()!.complaint).toBe('pause');
});

test("a run at 23:30 on Sunday matches that Sunday's plan", async () => {
  now = at(0);
  settings({ weekdays: [2, 6] });
  const coach = make();
  await coach.tick('pa');
  const sunday = week(W0)!.runs.find((r) => r.date === '2026-11-08');
  expect(sunday).toBeDefined();
  garmin = [run('g-sun', at(6, 23, 30), 30)];
  now = at(7, 8);
  await coach.tick('pa');
  expect(week(W0)!.runs.find((r) => r.date === '2026-11-08')!.done).toBe('g-sun');
  expect(status()!.card).toMatchObject({ runId: 'g-sun', date: '2026-11-08', kind: sunday!.kind });
});

test('a run on an unplanned day counts in the weekly numbers as unplanned', async () => {
  now = at(0);
  settings({ weekdays: [0, 2, 4] });
  const coach = make();
  await coach.tick('pa');
  garmin = [run('g-tue', at(1, 18), 40, 6)];
  now = at(2, 8);
  await coach.tick('pa');
  const s = status()!;
  expect(s.card).toMatchObject({ runId: 'g-tue', kind: 'unplanned' });
  expect(s.numbers.weeks.at(-1)).toMatchObject({ week: W0, km: 6, minutes: 40 });
  expect(week(W0)!.runs.every((r) => r.done === null)).toBe(true);
});

test('with a ride open tick does nothing', async () => {
  settings({ weekdays: [0, 2, 4, 6] });
  garmin = [run('g1', at(-3))];
  open = false;
  await make().tick('pa');
  expect(store.all('pa', 'run').map((r) => r.id)).toEqual(['settings']);
  expect(ask).not.toHaveBeenCalled();
});

test('after a week ended its review record is written once with a next-week focus', async () => {
  now = at(0);
  settings({ weekdays: [0, 2, 4] });
  garmin = [run('g1', at(0, 18), 30, 5), run('g2', at(4, 18), 35, 6)];
  const coach = make();
  await coach.tick('pa');
  expect(rec(`review-${W0}`)).toBeUndefined();
  now = at(7, 9);
  await coach.tick('pa');
  const r = rec(`review-${W0}`)!;
  const body = readRunBody(r.body) as RunReviewBody;
  expect(body).toMatchObject({ type: 'review', week: W0, km: 11, minutes: 65, runs: 2, longestKm: 6 });
  expect(body.focus.length).toBeGreaterThan(10);
  expect(body.focus).not.toMatch(/rekord|serie|streak|musst|pflicht/i);
  now = at(7, 12);
  await coach.tick('pa');
  expect(rec(`review-${W0}`)!.updatedMs).toBe(r.updatedMs);
  // A fresh cache does not write it again either.
  await make({ dir: path.join(dir, 'other') }).tick('pa');
  expect(rec(`review-${W0}`)!.updatedMs).toBe(r.updatedMs);
});

test('a settings record from the phone changes the weekdays at the next tick', async () => {
  now = at(0);
  const answers = { runsPerWeek: 3, usualMinutes: 30, pain: false };
  settings({ weekdays: [0, 2, 4], answers });
  const coach = make();
  await coach.tick('pa');
  expect(week(W0)!.runs.map((r) => r.date)).toEqual(['2026-11-02', '2026-11-04', '2026-11-06']);
  now = at(0, 10);
  settings({ weekdays: [1, 3, 5], answers }, now);
  await coach.tick('pa');
  expect(week(W0)!.runs.filter((r) => r.date >= '2026-11-03').map((r) => r.date)).toEqual(['2026-11-03', '2026-11-05', '2026-11-07']);
});

test('a replan never changes past dates of the week', async () => {
  now = at(0);
  settings({ weekdays: [0, 2, 4, 6] });
  garmin = [run('g-mon', at(0, 7), 25)];
  const coach = make();
  await coach.tick('pa');
  now = at(3);
  await coach.tick('pa');
  const before = week(W0)!.runs.filter((r) => r.date < '2026-11-05');
  complaints = [{ id: 'c1', text: 'Wade', status: 'healing', startedMs: now, updatedMs: now }];
  now = at(3, 10);
  await coach.tick('pa');
  expect(week(W0)!.runs.filter((r) => r.date < '2026-11-05')).toEqual(before);
});

describe('test runs and restarts', () => {
  /** Two 60-minute runs a week, Tuesday and Saturday, in weeks `from` to `to` relative to W0. */
  const history = (from: number, to: number): GarminRun[] => {
    const out: GarminRun[] = [];
    for (let w = from; w <= to; w++) out.push(run(`g${w}a`, at(7 * w + 1, 18), 60, 9), run(`g${w}b`, at(7 * w + 5, 10), 60, 9));
    return out;
  };
  const tests = (w: string) => (week(w)?.runs ?? []).filter((r) => r.kind === 'test');
  const weekKey = (n: number) => { const d = new Date(2026, 10, 2 + 7 * n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  test('a test is offered 28 days after switch-on', async () => {
    garmin = history(-1, 3);
    // Switched on on Sunday evening; the coach ticks every Monday morning and every Sunday evening, as the runtime would.
    now = at(-1, 20);
    settings({ weekdays: [0, 2, 4, 6] });
    const coach = make();
    await coach.tick('pa');
    for (let w = 0; w < 4; w++) {
      now = at(7 * w, 8);
      await coach.tick('pa');
      now = at(7 * w + 6, 18);
      await coach.tick('pa');
    }
    for (let w = 0; w < 4; w++) expect(tests(weekKey(w))).toEqual([]);
    // The 28 days end before week 4 starts: its Sunday plan has the test, and Monday keeps it.
    expect(tests(weekKey(4))).toHaveLength(1);
    now = at(28, 8);
    await coach.tick('pa');
    expect(tests(weekKey(4))).toHaveLength(1);
  });

  test('a skipped test is not re-offered the next week', async () => {
    garmin = history(-1, 4);
    now = at(0, 8);
    settings({ weekdays: [0, 2, 4, 6] });
    const coach = make();
    await coach.tick('pa');
    now = at(28, 8);
    await coach.tick('pa');
    expect(tests(weekKey(4))).toHaveLength(1);
    // No run on the test day; the next week comes without a test.
    garmin = garmin.filter((r) => r.startMs < at(28));
    garmin.push(...history(4, 4));
    now = at(35, 8);
    await coach.tick('pa');
    expect(week(weekKey(5))!.runs.length).toBeGreaterThan(0);
    expect(tests(weekKey(5))).toEqual([]);
  });

  test('the week after a restart ramps from the restart week', async () => {
    // Running before the complaint, a pause of two weeks, then two runs of 30 minutes in the restart week.
    garmin = [...history(-7, -3), run('r1', at(1, 18), 30, 5), run('r2', at(3, 18), 30, 5)];
    complaints = [{ id: 'c1', text: 'Knie', status: 'over', startedMs: at(-20), updatedMs: at(0, 8) }];
    settings({ weekdays: [1, 3, 5] }, at(0, 9));
    now = at(6, 18);
    await make().tick('pa');
    expect(status()!.complaint).toBe('restart');
    const next = week(W1)!;
    // Ramped from 60 restart-week minutes (66, halved for the restart), not from the mean over the pause.
    expect(next.runs.reduce((a, r) => a + r.minutes, 0)).toBeGreaterThan(25);
    expect(next.runs).toHaveLength(2);
  });
});

describe('the run cache', () => {
  test('a saved cache loads again, and a broken file starts fresh', () => {
    const d = path.join(dir, 'cache');
    const c = { ...initialRunCache('pa'), attempts: 2, planKey: { [W0]: 'k' }, onSinceMs: 5 };
    saveRunCache(d, c);
    expect(loadRunCache(d, 'pa')).toEqual(c);
    fs.writeFileSync(path.join(d, 'pa.json'), '{nope');
    expect(loadRunCache(d, 'pa')).toEqual(initialRunCache('pa'));
    fs.writeFileSync(path.join(d, 'pa.json'), '[]');
    expect(loadRunCache(d, 'pa')).toEqual(initialRunCache('pa'));
  });

  test('switching off clears the switch-on time; switching on again starts a new one', async () => {
    now = at(0);
    settings({ weekdays: [0, 2, 4] });
    const coach = make();
    await coach.tick('pa');
    expect(loadRunCache(path.join(dir, 'run'), 'pa').onSinceMs).toBe(at(0));
    now = at(1);
    settings({ on: false });
    await coach.tick('pa');
    expect(loadRunCache(path.join(dir, 'run'), 'pa').onSinceMs).toBeNull();
    now = at(2);
    settings({ weekdays: [0, 2, 4] });
    await coach.tick('pa');
    expect(loadRunCache(path.join(dir, 'run'), 'pa').onSinceMs).toBe(at(2));
  });
});

describe('fix round 1', () => {
  test('a record whose id and body type disagree is ignored', async () => {
    now = at(0);
    settings({ weekdays: [0, 2, 4] });
    // A week body under a manual-run id must not count as a plan for Tuesday.
    store.put('pa', { kind: 'run', id: 'manual-x', updatedMs: now, deleted: false, body: { type: 'week', week: W0, announce: false, atMs: now, phase: 1, source: 'rules', reason: 'x', note: null,
      runs: [{ date: '2026-11-03', kind: 'long', minutes: 50, hrCap: null, counts: 'x', note: null, fp: 'f', done: null }], garmin: null } });
    // A settings body under the status id is no settings record.
    store.put('pa', { kind: 'run', id: 'status', updatedMs: 1, deleted: false, body: { type: 'settings', on: true, weekdays: [1], answers: null } });
    const coach = make();
    await coach.tick('pa');
    garmin = [run('g-tue', at(1, 18), 40, 6)];
    now = at(2, 8);
    await coach.tick('pa');
    const s = status()!;
    expect(s.card).toMatchObject({ runId: 'g-tue', kind: 'unplanned' });
    expect(s.numbers.weeks.at(-1)!.plannedMinutes).toBe(week(W0)!.runs.reduce((a, r) => a + r.minutes, 0));
    expect(rec('manual-x')!.body).toMatchObject({ type: 'week' });
  });

  test('with running off or never on, Garmin runs give the coach no runs for mobility', async () => {
    garmin = [run('g1', at(1, 18))];
    const coach = make();
    await coach.tick('pa');
    expect(coach.runs('pa')).toEqual([]);
    settings({ on: false });
    await coach.tick('pa');
    expect(coach.runs('pa')).toEqual([]);
    settings({ on: true }, now + 1);
    await coach.tick('pa');
    expect(coach.runs('pa').map((r) => r.id)).toEqual(['g1']);
  });

  test('the switch-on time is when the settings say, not when the coach first sees them', async () => {
    settings({ weekdays: [0, 2, 4] }, at(0, 7));
    now = at(3);
    await make().tick('pa');
    expect(loadRunCache(path.join(dir, 'run'), 'pa').onSinceMs).toBe(at(0, 7));
  });

  test('a suggest status is removed once Garmin is gone and no settings exist', async () => {
    garmin = [run('g1', at(-10))];
    const coach = make();
    await coach.tick('pa');
    expect(status()).toMatchObject({ suggest: true });
    garmin = null;
    now += HOUR;
    await coach.tick('pa');
    expect(rec('status')!.deleted).toBe(true);
  });

  test("a ride opened while Claude thinks: nothing is written, and Claude's answer is written after the ride", async () => {
    settings({ weekdays: [0, 2, 4, 6] });
    const answer = echo('Nach der Fahrt.');
    ask = vi.fn(async (input: { prompt: string }) => { open = false; return answer(input); });
    const coach = make();
    await coach.tick('pa');
    expect(week(W0)).toMatchObject({ source: 'rules' });
    expect(rec('status')).toBeUndefined();
    open = true;
    now += 30 * 60_000;
    await coach.tick('pa');
    expect(week(W0)).toMatchObject({ source: 'claude', reason: 'Nach der Fahrt.' });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(status()).not.toBeNull();
  });

  test('two profiles side by side keep their own plans and runs', async () => {
    const runsOf: Record<string, GarminRun[]> = { pa: [run('a1', at(1, 18))], pb: [run('b1', at(1, 7), 50, 8)] };
    const coach = make({
      profile: (id) => ({ id, name: id, ftpW: 200 }) as Profile,
      garminDb: (id) => ({ runs: (fromMs: number) => runsOf[id]!.filter((r) => r.startMs >= fromMs), activityFile: () => null, body: () => null }),
    });
    store.put('pa', { kind: 'run', id: 'settings', updatedMs: now, deleted: false, body: { type: 'settings', on: true, weekdays: [2, 4], answers: null } });
    store.put('pb', { kind: 'run', id: 'settings', updatedMs: now, deleted: false, body: { type: 'settings', on: true, weekdays: [3, 5], answers: null } });
    await Promise.all([coach.tick('pa'), coach.tick('pb')]);
    const weekOf = (p: string) => readRunBody(store.all(p, 'run').find((r) => r.id === `week-${W0}`)!.body) as RunWeekBody;
    const statusOf = (p: string) => readRunBody(store.all(p, 'run').find((r) => r.id === 'status')!.body) as RunStatusBody;
    expect(weekOf('pa').runs.map((r) => r.date)).toEqual(['2026-11-04', '2026-11-06']);
    expect(weekOf('pb').runs.map((r) => r.date)).toEqual(['2026-11-05', '2026-11-07']);
    expect(statusOf('pa').card!.runId).toBe('a1');
    expect(statusOf('pb').card!.runId).toBe('b1');
    expect(coach.runs('pa').map((r) => r.id)).toEqual(['a1']);
    expect(coach.runs('pb').map((r) => r.id)).toEqual(['b1']);
  });

  test('every finished week since the last review gets its review, up to 4 weeks back', async () => {
    now = at(0);
    settings({ weekdays: [0, 2, 4] });
    const coach = make();
    await coach.tick('pa');
    now = at(6, 18);
    await coach.tick('pa');
    expect(week(W1)).not.toBeNull();
    // Offline for the whole of week 1.
    now = at(14, 9);
    await coach.tick('pa');
    expect(rec(`review-${W0}`)).toBeDefined();
    expect(rec(`review-${W1}`)).toBeDefined();
  });
});
