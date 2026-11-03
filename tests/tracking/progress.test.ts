import { estimatedMax, progressRows } from '../../src/tracking/progress';
import type { LoggedWorkout } from '../../src/shared/records';
import { MUSCLE_TARGETS } from '../../src/shared/muscle-targets';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 4, 12).getTime();
const set = (weightKg: number | null, reps: number | null, type: 'normal' | 'warmup' = 'normal') => ({ type, weightKg, reps, durationS: null, doneMs: 1 });
const wo = (daysAgo: number, exerciseId: string, title: string, sets: ReturnType<typeof set>[]): LoggedWorkout => ({
  id: `${exerciseId}${daysAgo}`, title: 'T', startMs: NOW - daysAgo * DAY, endMs: NOW - daysAgo * DAY + 3600_000, source: 'pandafit',
  exercises: [{ exerciseId, title, supersetId: null, notes: '', sets }],
});
const noTargets = Object.fromEntries(Object.keys(MUSCLE_TARGETS).map((g) => [g, { min: 0, max: 0 }])) as Record<string, { min: number; max: number }>;
const base = { nowMs: NOW, ftp: [], weightKg: null, runPace: null, workouts: [], weeks: [], targets: noTargets as never };

test('estimated max: Epley from working sets of 1 to 12 reps, warm-ups and bodyweight ignored', () => {
  expect(estimatedMax([set(60, 10)])).toBe(80);
  expect(estimatedMax([set(100, 1), set(80, 10, 'warmup')])).toBe(100);
  expect(estimatedMax([set(50, 20), set(null, 10)])).toBeNull();
});

test('nothing to show: no rows', () => expect(progressRows(base)).toEqual([]));

test('bike: FTP now with W/kg and the change against about eight weeks ago', () => {
  const rows = progressRows({ ...base, ftp: [{ atMs: NOW - 70 * DAY, ftpW: 200 }, { atMs: NOW - 30 * DAY, ftpW: 205 }, { atMs: NOW - 2 * DAY, ftpW: 212 }], weightKg: 80 });
  expect(rows).toEqual([{ label: 'Fitter (Rad)', value: 'FTP 212 W · 2,7 W/kg', change: '+12 W seit 10 Wochen' }]);
});

test('run: easy pace now and against twelve weeks ago, faster is a minus', () => {
  const rows = progressRows({ ...base, runPace: { now: 370, weeks4: 375, weeks12: 382 } });
  expect(rows).toEqual([{ label: 'Schneller (Laufen)', value: 'Lockeres Tempo 6:10 /km', change: '12 s schneller als vor 12 Wochen' }]);
});

test('strength: the three most trained lifts, last four weeks against the eight before', () => {
  const w = [
    wo(3, 'pf-bench-press', 'Bankdrücken', [set(60, 10)]), wo(40, 'pf-bench-press', 'Bankdrücken', [set(57.5, 10)]), wo(50, 'pf-bench-press', 'Bankdrücken', [set(55, 10)]),
    wo(5, 'pf-squat', 'Kniebeuge', [set(80, 5)]), wo(45, 'pf-squat', 'Kniebeuge', [set(80, 5)]),
    wo(6, 'pf-row', 'Rudern', [set(50, 10)]),
    wo(7, 'pf-curl', 'Curls', [set(12, 10)]), wo(100, 'pf-old', 'Alt', [set(10, 10)]),
  ];
  const [row] = progressRows({ ...base, workouts: w });
  expect(row!.label).toBe('Stärker (Kraft)');
  expect(row!.value).toBe('Bankdrücken ~80 kg (+3,3) · Kniebeuge ~93 kg (±0) · Rudern ~67 kg');
});

test('muscle: groups in their band on average over the last four weeks', () => {
  const targets = { ...noTargets, chest: { min: 10, max: 20 }, back: { min: 10, max: 20 }, biceps: { min: 6, max: 10 } };
  const weeks = [{ sets: {} }, { sets: { chest: 12, back: 4 } }, { sets: { chest: 12, back: 4 } }, { sets: { chest: 12, back: 4 } }, { sets: { chest: 12, back: 4 } }];
  expect(progressRows({ ...base, targets, weeks } as never)).toEqual([{ label: 'Muskelaufbau', value: '1 von 3 Muskelgruppen im Zielbereich', change: 'Schnitt der letzten 4 Wochen' }]);
});
