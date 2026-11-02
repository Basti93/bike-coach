import { allTraining } from '../../src/coach/all-training';

const MIN = 60_000;
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m, d, h, min).getTime();
const NOW = at(2027, 5, 16, 12); // Wednesday
const ride = (rideId: string, startedAtMs: number, minutes = 45, sessionName?: string) => ({ rideId, startedAtMs, durationS: minutes * 60, sessionName });
const lift = (id: string, startMs: number, minutes = 50, title = 'Beine') => ({ id, title, startMs, durationS: minutes * 60 });
const act = (id: string, startMs: number, sport: string, minutes = 60, fromBikeCoach = false) => ({ id, startMs, durationS: minutes * 60, sport, name: null, fromBikeCoach });

test('nothing at all gives no section', () => {
  expect(allTraining({}, NOW)).toBeNull();
  expect(allTraining({ rides: [], workouts: null, activities: undefined }, NOW)).toBeNull();
});

test('twelve local weeks from Monday, empty weeks are zero, sources stay split', () => {
  const r = allTraining({
    rides: [ride('r1', at(2027, 5, 15), 45), ride('r2', at(2027, 5, 14), 30)],
    workouts: [lift('w1', at(2027, 5, 15, 18), 50)],
    activities: [act('a1', at(2027, 5, 9), 'running', 40)],
  }, NOW)!;
  expect(r.weeks).toHaveLength(12);
  expect(r.weeks[11].weekStartMs).toBe(at(2027, 5, 14, 0));
  expect(r.weeks[11].rad).toEqual({ sessions: 2, minutes: 75 });
  expect(r.weeks[11].kraft).toEqual({ sessions: 1, minutes: 50 });
  expect(r.weeks[11].andere).toEqual({ sessions: 0, minutes: 0 });
  expect(r.weeks[11]).toMatchObject({ sessions: 3, minutes: 125 });
  expect(r.weeks[10].andere).toEqual({ sessions: 1, minutes: 40 });
  expect(r.weeks[5]).toMatchObject({ sessions: 0, minutes: 0, rad: { sessions: 0, minutes: 0 } });
  expect(r.sources).toEqual(['rad', 'kraft', 'andere']);
});

test('a ride that is also at Garmin counts once, as Rad', () => {
  const start = at(2027, 5, 15);
  const r = allTraining({
    rides: [ride('r1', start, 45, 'Grundlage')],
    activities: [act('g1', start + 2 * MIN, 'indoor_cycling', 44, true), act('g2', start + 1 * MIN, 'cycling', 46)],
  }, NOW)!;
  expect(r.weeks[11]).toMatchObject({ sessions: 1, rad: { sessions: 1 }, andere: { sessions: 0 } });
  expect(r.recent).toHaveLength(1);
  expect(r.recent[0]).toMatchObject({ source: 'rad', title: 'Grundlage' });
});

test('a Hevy workout that is also at Garmin as strength counts once, as Kraft', () => {
  const start = at(2027, 5, 15, 18);
  const r = allTraining({
    workouts: [lift('w1', start, 50)],
    activities: [act('g1', start + 3 * MIN, 'strength_training', 48)],
  }, NOW)!;
  expect(r.weeks[11]).toMatchObject({ sessions: 1, kraft: { sessions: 1, minutes: 50 }, andere: { sessions: 0 } });
  expect(r.recent.map((s) => s.source)).toEqual(['kraft']);
});

test('sessions that only touch, or other sports at the same time, are not merged', () => {
  const start = at(2027, 5, 15, 10);
  const r = allTraining({
    rides: [ride('r1', start, 45)],
    workouts: [lift('w1', start + 45 * MIN, 50)],
    activities: [act('g1', start + 45 * MIN, 'strength_training', 50), act('g2', start, 'running', 45)],
  }, NOW)!;
  // g1 is the workout again, g2 is a run that overlaps the ride but is another sport
  expect(r.weeks[11]).toMatchObject({ sessions: 3, rad: { sessions: 1 }, kraft: { sessions: 1 }, andere: { sessions: 1 } });
});

test('a Garmin ride from this app without a local record still counts as Rad', () => {
  const r = allTraining({ activities: [act('g1', at(2027, 5, 15), 'indoor_cycling', 30, true), act('g2', at(2027, 5, 14), 'cycling', 60)] }, NOW)!;
  expect(r.weeks[11]).toMatchObject({ rad: { sessions: 1, minutes: 30 }, andere: { sessions: 1, minutes: 60 } });
});

test('each source can be missing and just drops out', () => {
  expect(allTraining({ rides: [ride('r', at(2027, 5, 15))] }, NOW)!.sources).toEqual(['rad']);
  expect(allTraining({ workouts: [lift('w', at(2027, 5, 15))] }, NOW)!.sources).toEqual(['kraft']);
  expect(allTraining({ activities: [act('a', at(2027, 5, 15), 'hiking')] }, NOW)!.sources).toEqual(['andere']);
  expect(allTraining({ rides: [ride('r', at(2027, 5, 15))], activities: [act('a', at(2027, 5, 15), 'hiking')] }, NOW)!.sources).toEqual(['rad', 'andere']);
});

test('the week across the clock change is a normal Monday-based week', () => {
  const now = at(2027, 2, 31, 12); // Wednesday after the change in Europe
  const r = allTraining({ rides: [ride('a', at(2027, 2, 28, 0, 30)), ride('b', at(2027, 2, 29, 0, 0)), ride('c', at(2027, 2, 22, 23, 59))] }, now)!;
  expect(r.weeks[11].weekStartMs).toBe(new Date(2027, 2, 29).getTime());
  r.weeks.forEach((w) => { const d = new Date(w.weekStartMs); expect(d.getDay()).toBe(1); expect(d.getHours()).toBe(0); });
  expect(r.weeks[11].rad.sessions).toBe(1);
  expect(r.weeks[10].rad.sessions).toBe(2); // Sunday 00:30 and the Monday 22nd at 23:59 are the same week
});

test('a session exactly at Monday 00:00 belongs to the new week, one minute before to the old', () => {
  const monday = at(2027, 5, 14, 0);
  const r = allTraining({ rides: [ride('a', monday), ride('b', monday - MIN)] }, NOW)!;
  expect(r.weeks[11].rad.sessions).toBe(1);
  expect(r.weeks[10].rad.sessions).toBe(1);
});

test('the list keeps the newest ten of all sources, older sessions stay out of the weeks', () => {
  const many = Array.from({ length: 8 }, (_, i) => ride(`r${i}`, at(2027, 5, 15 - i, 8)));
  const r = allTraining({ rides: many, workouts: [lift('w1', at(2027, 5, 15, 20)), lift('w2', at(2027, 5, 14, 20))], activities: [act('old', at(2026, 0, 5), 'running')] }, NOW)!;
  expect(r.recent).toHaveLength(10);
  expect(r.recent[0]).toMatchObject({ source: 'kraft', title: 'Beine' });
  for (let i = 1; i < r.recent.length; i++) expect(r.recent[i].startMs).toBeLessThanOrEqual(r.recent[i - 1].startMs);
  expect(r.weeks.reduce((a, w) => a + w.sessions, 0)).toBe(10);
});
