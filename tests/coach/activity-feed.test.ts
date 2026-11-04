import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activitiesHint, allActivities, ActivitySeen } from '../../src/coach/activity-feed';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m, d, h, min).getTime();
const NOW = at(2027, 5, 16, 18);
const ride = (rideId: string, startedAtMs: number, minutes = 45) => ({ rideId, startedAtMs, durationS: minutes * 60 });
const lift = (id: string, startMs: number, minutes = 50) => ({ id, title: 'Beine', startMs, durationS: minutes * 60 });
const act = (id: string, startMs: number, sport: string, minutes = 40) => ({ id, startMs, durationS: minutes * 60, sport, name: null, fromBikeCoach: false });
const manual = (id: string, startMs: number, minutes = 30) => ({ id, startMs, durationS: minutes * 60 });

test('every source counts once, a run entered by hand and recorded by Garmin too only once', () => {
  const all = allActivities({
    rides: [ride('r1', at(2027, 5, 15))],
    workouts: [lift('w1', at(2027, 5, 14))],
    activities: [act('g1', at(2027, 5, 16, 16), 'running'), act('g2', at(2027, 5, 15), 'cycling')],
    manualRuns: [manual('m1', at(2027, 5, 16, 16, 5)), manual('m2', at(2027, 5, 13))],
  });
  expect(all.map((s) => s.key).sort()).toEqual(['garmin-g1', 'kraft-w1', 'lauf-m2', 'rad-r1']);
});

test('the hint lists the last seven days oldest first and is empty without any', () => {
  const all = allActivities({
    rides: [ride('r1', at(2027, 5, 15, 7))],
    activities: [act('g1', at(2027, 5, 16, 16, 52), 'running', 42), act('old', NOW - 8 * DAY, 'running')],
  });
  const hint = activitiesHint(all, NOW);
  expect(hint).toContain('<aktivitaeten-nur-daten>');
  expect(hint).toContain('{"tag":"2027-06-15","uhrzeit":"07:00","art":"Rad","titel":null,"minuten":45},{"tag":"2027-06-16","uhrzeit":"16:52","art":"running","titel":null,"minuten":42}');
  expect(hint).not.toContain('"minuten":40');
  expect(activitiesHint([], NOW)).toBe('');
});

describe('ActivitySeen', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seen-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = () => path.join(dir, 'chat', 'activities-seen.json');
  const s = (key: string, startMs: number) => ({ key, startMs });

  test('a new activity counts once, also one that started earlier than the newest', () => {
    const seen = new ActivitySeen(file());
    seen.check('p', [s('a', NOW - 2 * DAY)], NOW);
    expect(seen.check('p', [s('a', NOW - 2 * DAY)], NOW)).toBe(false);
    expect(seen.check('p', [s('a', NOW - 2 * DAY), s('b', NOW - 3 * DAY)], NOW)).toBe(true);
    expect(seen.check('p', [s('a', NOW - 2 * DAY), s('b', NOW - 3 * DAY)], NOW)).toBe(false);
    expect(seen.version('p')).toBe(1);
    // Kept across a restart.
    expect(new ActivitySeen(file()).check('p', [s('a', NOW - 2 * DAY), s('b', NOW - 3 * DAY)], NOW)).toBe(false);
    expect(new ActivitySeen(file()).version('p')).toBe(1);
  });

  test('the first look counts only an activity of the last day, old ones and removed ones never', () => {
    const seen = new ActivitySeen(file());
    expect(seen.check('old', [s('a', NOW - 3 * DAY)], NOW)).toBe(false);
    expect(seen.check('fresh', [s('a', NOW - 3 * DAY), s('b', NOW - 2 * HOUR)], NOW)).toBe(true);
    expect(seen.check('fresh', [s('a', NOW - 3 * DAY)], NOW)).toBe(false);
    // Older than the window: never news.
    expect(seen.check('fresh', [s('a', NOW - 3 * DAY), s('ancient', NOW - 30 * DAY)], NOW)).toBe(false);
  });
});
