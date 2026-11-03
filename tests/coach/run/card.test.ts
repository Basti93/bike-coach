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

test('the slower threshold is 3 %: 2 % above the trend is not explained, 4 % is', () => {
  const at = (pct: number) => runCard(run({ easyPace: { sPerKm: 372 * pct, seconds: 1800 } }), planned(), { ...ctx, dayBefore: hardDay }).sentence;
  expect(at(1.02)).not.toContain('gestern');
  expect(at(1.04)).toContain('gestern');
});

test('a legs day before is named as leg training, a hard day as a strenuous day', () => {
  const slow = run({ easyPace: { sPerKm: 400, seconds: 1800 } });
  const legs = runCard(slow, planned(), { ...ctx, dayBefore: { date: '2027-06-15', hardness: 'moderate', legs: true, minutes: 45 } }).sentence;
  expect(legs).toContain('Beintraining gestern');
  expect(legs).not.toContain('anstrengenden Tag');
  expect(runCard(slow, planned(), { ...ctx, dayBefore: hardDay }).sentence).toContain('anstrengenden Tag');
});

test('without a usable easy pace the card says only what the run was', () => {
  const judging = /zu wenig|ruhige Teil|kurz|ruhig gelaufen/i;
  const plain = [
    run({ type: 'trail_running', easyPace: null }),
    run({ type: 'treadmill_running', easyPace: null }),
    // A road run whose FIT file is not there yet.
    run({ easyPace: null }),
    // A manual run whose average heart rate was outside the band.
    run({ source: 'manual', easyPace: null }),
  ];
  for (let i = 0; i < 4; i++) {
    for (const r of plain) {
      const c = runCard({ ...r, startMs: T0 + i * 60_000 }, planned(), ctx);
      expect(`${c.counted} ${c.sentence}`).not.toMatch(judging);
      expect(c.counted).toContain('40 Min');
      expect(c.result).toBe('5,2 km');
    }
  }
  // Trail without heart rate: no hint that a strap would bring a pace.
  expect(runCard(run({ type: 'trail_running', hasHr: false, avgHr: null, easyPace: null }), planned(), ctx).sentence).not.toMatch(/Pulsgurt|Tempo/);
});

test('a road run with a FIT file and heart rate but under 5 easy minutes says so, neutrally', () => {
  for (let i = 0; i < 4; i++) {
    const c = runCard(run({ startMs: T0 + i * 60_000, easyPace: null, fewEasy: true }), planned(), ctx);
    expect(c.counted).toContain('unter 5 Minuten im ruhigen Bereich');
    expect(`${c.counted} ${c.sentence}`).not.toMatch(/zu wenig|kurz|nur /i);
    expect(c.result).toBe('5,2 km');
  }
});
