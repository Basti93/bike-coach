import { runCard } from '../../../src/coach/run/card';
import type { Run } from '../../../src/coach/run/garmin-runs';
import type { PlannedRun } from '../../../src/shared/run';
import type { DayRating } from '../../../src/coach/day-load';

const T0 = new Date(2027, 5, 16, 8).getTime();
const run = (o: Partial<Run> = {}): Run => ({
  id: 'r1', source: 'garmin', type: 'running', startMs: T0, durationS: 2400, distanceM: 5230, avgHr: 130, maxHr: 150,
  elevationGainM: 10, hasHr: true, easyPace: { sPerKm: 372, seconds: 1800 }, best30M: null, tempC: 12, ...o,
});
const planned = (kind: PlannedRun['kind'] = 'easy'): PlannedRun => ({ date: '2027-06-16', kind, minutes: 40, hrCap: 143, counts: '', note: null });
const ctx = { trendNow: 372 as number | null, dayBefore: null as DayRating | null, sleepS: null as number | null };
const hardDay: DayRating = { date: '2027-06-15', hardness: 'hard', legs: false, minutes: 60 };

test('an easy run with heart rate says what counted and its easy pace', () => {
  const c = runCard(run(), planned(), ctx);
  expect(c.kind).toBe('easy');
  expect(c.date).toBe('2027-06-16');
  expect(c.counted).toMatch(/30 Min/);
  expect(c.result).toContain('6:12 /km');
  expect(c.sentence.length).toBeGreaterThan(0);
});

test('a run without heart rate says "ohne Puls" and no pace', () => {
  const c = runCard(run({ hasHr: false, avgHr: null, easyPace: null }), null, ctx);
  expect(c.kind).toBe('unplanned');
  expect(c.counted).toContain('ohne Puls');
  expect(c.result).not.toMatch(/\/km/);
  expect(c.result).toContain('5,2 km');
});

test('a slower easy run is explained by a hard day before, hills or heat, never judged', () => {
  const slow = run({ easyPace: { sPerKm: 400, seconds: 1800 } });
  const c = runCard(slow, planned(), { ...ctx, dayBefore: hardDay });
  expect(c.sentence).toContain('gestern');
  expect(c.sentence).not.toMatch(/langsam|schlecht|enttäusch/i);
  expect(runCard(run({ easyPace: { sPerKm: 400, seconds: 1800 }, elevationGainM: 120 }), planned(), ctx).sentence).toMatch(/Höhenmeter|Steigung|Hügel/);
  expect(runCard(run({ easyPace: { sPerKm: 400, seconds: 1800 }, tempC: 28 }), planned(), ctx).sentence).toMatch(/warm|Wärme|Hitze/);
  expect(runCard(slow, planned(), { ...ctx, sleepS: 5 * 3600 }).sentence).toMatch(/Nacht|Schlaf/);
  // not slower: no excuse
  expect(runCard(run(), planned(), { ...ctx, dayBefore: hardDay }).sentence).not.toContain('gestern');
});

test('a test run shows its 30-minute distance', () => {
  const c = runCard(run({ best30M: 5100 }), planned('test'), ctx);
  expect(c.kind).toBe('test');
  expect(c.result).toContain('5,1 km');
  expect(c.result).toContain('30');
});

test('no card text contains Rekord, Serie, Streak, musst or Pflicht', () => {
  const slow = { easyPace: { sPerKm: 420, seconds: 1800 } };
  const cases: Run[][] = [];
  for (let i = 0; i < 12; i++) {
    const t = T0 + i * 1000;
    cases.push([run({ startMs: t }), run({ startMs: t, hasHr: false, easyPace: null }), run({ startMs: t, easyPace: null }), run({ startMs: t, best30M: 5000 }),
      run({ startMs: t, ...slow }), run({ startMs: t, ...slow, elevationGainM: 200 }), run({ startMs: t, ...slow, tempC: 30 })]);
  }
  for (const r of cases.flat()) {
    for (const p of [null, planned(), planned('long'), planned('test')]) {
      for (const c of [ctx, { ...ctx, dayBefore: hardDay }, { ...ctx, sleepS: 4 * 3600 }, { ...ctx, trendNow: null }]) {
        const card = runCard(r, p, c);
        expect(`${card.counted} ${card.result} ${card.sentence}`).not.toMatch(/Rekord|Serie|Streak|musst|Pflicht/i);
      }
    }
  }
});
