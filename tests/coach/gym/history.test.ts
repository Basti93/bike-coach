import { describe, expect, it } from 'vitest';
import type { StrengthWorkout, SetType } from '../../../src/coach/hevy';
import { availableExercises, isAssisted, isRepBased, recentLegWork, suggestNext } from '../../../src/coach/gym/history';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 2, 12);
type S = [number | null, number, SetType?];
const wk = (daysAgo: number, sets: S[], templateId = 'sq', title = 'Squat'): StrengthWorkout => ({
  id: `w${daysAgo}${templateId}`, title: 'Day', startMs: NOW - daysAgo * DAY, durationS: 3600,
  exercises: [{ title, templateId, sets: sets.length, reps: 0, volumeKg: 0, workSets: sets.map(([weightKg, reps, type]) => ({ type: type ?? 'normal', weightKg, reps })) }],
});

// Invented catalog entries: chest (range 6-12) on plates in 2.5-kg steps, a machine in 5-kg steps, a side-delt isolation lift (range 12-25).
const PLATES = { type: 'weight_reps', equipment: 'barbell', primaryMuscle: 'chest' };
const MACHINE = { type: 'weight_reps', equipment: 'machine', primaryMuscle: 'chest' };
const RAISE = { type: 'weight_reps', equipment: 'dumbbell', primaryMuscle: 'side_delts' };
const suggest = (id: string, ws: StrengthWorkout[], now: number, ex: Parameters<typeof suggestNext>[3] = PLATES, plan?: Parameters<typeof suggestNext>[4]) => suggestNext(id, ws, now, ex, plan);

const withEffort = (w: StrengthWorkout, effort: 'none' | 'some' | 'plenty'): StrengthWorkout => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, effort })) });

describe('suggestNext with effort answers', () => {
  it('3+ left goes up even where the reps alone would keep', () => {
    const r = suggest('sq', [wk(14, [[60, 10], [60, 10]]), withEffort(wk(7, [[60, 10], [60, 8]]), 'plenty')], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('3+ left after a single session goes up too', () => {
    expect(suggest('sq', [withEffort(wk(7, [[60, 8], [60, 8]]), 'plenty')], NOW)).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('1-2 left changes nothing', () => {
    const plain = suggest('sq', [wk(14, [[60, 8], [60, 8]]), wk(7, [[60, 8], [60, 9]])], NOW);
    expect(suggest('sq', [wk(14, [[60, 8], [60, 8]]), withEffort(wk(7, [[60, 8], [60, 9]]), 'some')], NOW)).toEqual(plain);
  });
  it('0 left is no reason to hold: the numbers decide, as with unknown effort', () => {
    const sessions = [wk(14, [[60, 8], [60, 8]]), wk(7, [[60, 8], [60, 9]])];
    const plain = suggest('sq', sessions, NOW);
    expect(suggest('sq', [sessions[0], withEffort(sessions[1], 'none')], NOW)).toEqual(plain);
    expect(plain).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('F02: three sessions at 0 left with rising reps never lower the weight and progress at the range max', () => {
    const rising = [withEffort(wk(21, [[60, 10], [60, 10]]), 'none'), withEffort(wk(14, [[60, 11], [60, 11]]), 'none'), withEffort(wk(7, [[60, 12], [60, 12]]), 'none')];
    expect(suggest('sq', rising.slice(0, 2), NOW)).toEqual({ weightKg: 60, reps: 12, why: 'progress' });
    expect(suggest('sq', rising, NOW)).toEqual({ weightKg: 62.5, reps: 6, why: 'progress' });
  });
});

describe('suggestNext', () => {
  it('all reps reached twice in 56 days adds reps first', () => {
    const r = suggest('sq', [wk(14, [[60, 8], [60, 8]]), wk(7, [[60, 8], [60, 9]])], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('keeps the value when the last session fell short', () => {
    const r = suggest('sq', [wk(14, [[60, 10], [60, 10]]), wk(7, [[60, 10], [60, 8]])], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 8, why: 'keep' });
  });
  it('one session is too little and keeps the last value', () => {
    expect(suggest('sq', [wk(7, [[60, 8]])], NOW)).toEqual({ weightKg: 60, reps: 8, why: 'keep' });
  });
  it('an older second session does not count as comparable', () => {
    expect(suggest('sq', [wk(60, [[60, 8]]), wk(7, [[60, 9]])], NOW).why).toBe('keep');
  });
  it('after 28 days without it the weight drops to the reachable weight at or below 90 %', () => {
    expect(suggest('sq', [wk(40, [[60, 8]]), wk(35, [[60, 8]])], NOW)).toEqual({ weightKg: 52.5, reps: 8, why: 'step-back' });
  });
  it('no history gives no weight', () => {
    expect(suggest('sq', [], NOW)).toEqual({ weightKg: null, reps: 6, why: 'none' });
    expect(suggest('sq', [], NOW, RAISE).reps).toBe(12);
    expect(suggest('sq', [wk(3, [[50, 8]], 'other')], NOW).why).toBe('none');
  });
  it('bodyweight stays without weight and adds reps', () => {
    const r = suggest('pu', [wk(14, [[null, 12], [null, 12]], 'pu'), wk(7, [[null, 12], [null, 12]], 'pu')], NOW);
    expect(r).toEqual({ weightKg: null, reps: 13, why: 'progress' });
  });
  it('warmup sets do not count', () => {
    const r = suggest('sq', [wk(14, [[20, 12, 'warmup'], [60, 8]]), wk(7, [[100, 12, 'warmup'], [60, 8]])], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('skips exercises without a template id', () => {
    expect(suggest('', [wk(7, [[60, 8]], '')], NOW).why).toBe('none');
  });
});

describe('availableExercises', () => {
  it('an exercise older than 120 days is known but not recent', () => {
    const r = availableExercises([wk(200, [[60, 8]], 'old', 'Old'), wk(5, [[60, 8]], 'new', 'New'), wk(9, [[1, 1]], '', 'Nameless')], NOW);
    expect(r).toEqual([
      { templateId: 'new', title: 'New', lastMs: NOW - 5 * DAY, recent: true },
      { templateId: 'old', title: 'Old', lastMs: NOW - 200 * DAY, recent: false },
    ]);
  });
});

describe('recentLegWork', () => {
  const templates = [
    { id: 'sq', title: 'Squat', type: 'weight_reps', primaryMuscle: 'quadriceps', equipment: 'barbell' },
    { id: 'bp', title: 'Bench', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'barbell' },
  ];
  it('leg work yesterday counts, a chest day does not', () => {
    expect(recentLegWork([wk(1, [[60, 8]], 'sq')], templates, NOW)).toBe(true);
    expect(recentLegWork([wk(1, [[60, 8]], 'bp')], templates, NOW)).toBe(false);
    expect(recentLegWork([wk(3, [[60, 8]], 'sq')], templates, NOW)).toBe(false);
  });
});

describe('progression per exercise', () => {
  const at = (days: number, kg: number, reps: number) => wk(days, [[kg, reps], [kg, reps]]);
  it('the range max reached on a 5-kg machine goes up by 5, with the reps at the range min', () => {
    const ws = [at(21, 35, 12), at(14, 40, 11), at(7, 40, 12)];
    expect(suggest('sq', ws, NOW, MACHINE)).toEqual({ weightKg: 45, reps: 6, why: 'progress' });
  });
  it('a lateral raise uses the range of its group, not 6-12', () => {
    expect(suggest('sq', [at(14, 8, 12), at(7, 8, 13)], NOW, RAISE)).toEqual({ weightKg: 8, reps: 14, why: 'progress' });
    expect(suggest('sq', [at(14, 8, 24), at(7, 8, 25)], NOW, RAISE)).toEqual({ weightKg: 10, reps: 12, why: 'progress' });
    expect(suggest('sq', [at(7, 8, 30)], NOW, RAISE)).toEqual({ weightKg: 8, reps: 25, why: 'keep' });
  });
  it('two drops in a row at the same or a higher weight step back onto a reachable weight', () => {
    const ws = [at(21, 40, 10), at(14, 45, 9), at(7, 50, 7)];
    const r = suggest('sq', ws, NOW, MACHINE);
    expect(r).toEqual({ weightKg: 45, reps: 7, why: 'step-back' });
    expect((r.weightKg! - 40) % 5).toBe(0);
  });
  it('one drop alone only keeps', () => {
    expect(suggest('sq', [at(21, 40, 8), at(14, 40, 10), at(7, 40, 8)], NOW, MACHINE).why).toBe('keep');
  });
  it('a lower weight after a drop is no second drop', () => {
    expect(suggest('sq', [at(21, 50, 10), at(14, 50, 8), at(7, 45, 6)], NOW, MACHINE).why).toBe('keep');
  });
  it('history in another studio is not used', () => {
    const own = (w: StrengthWorkout, studio: string): StrengthWorkout => ({ ...w, studio });
    const ws = [own(at(21, 40, 12), 'Alpha'), own(at(14, 40, 12), 'Alpha'), own(at(7, 20, 8), 'Beta')];
    expect(suggest('sq', ws, NOW, MACHINE, { studio: 'Alpha' })).toEqual({ weightKg: 45, reps: 6, why: 'progress' });
    expect(suggest('sq', ws, NOW, MACHINE, { studio: 'Beta' })).toEqual({ weightKg: 20, reps: 8, why: 'keep' });
    expect(suggest('sq', ws, NOW, MACHINE, { studio: 'Gamma' }).why).toBe('none');
  });
  it('workouts without a studio count for the main one', () => {
    const ws = [at(21, 40, 12), { ...at(14, 40, 12), studio: 'Alpha' }];
    expect(suggest('sq', ws, NOW, MACHINE, { studio: 'Alpha' }).weightKg).toBe(45);
  });
  it('several occurrences in one workout are one session', () => {
    const w = at(7, 40, 8);
    const double: StrengthWorkout = { ...w, exercises: [w.exercises[0], { ...w.exercises[0] }] };
    expect(suggest('sq', [at(14, 40, 8), double], NOW, MACHINE)).toEqual({ weightKg: 40, reps: 9, why: 'progress' });
  });
  it("the person's step replaces the learned one", () => {
    const ws = [at(14, 40, 12), at(7, 40, 12)];
    expect(suggest('sq', ws, NOW, MACHINE, { overrides: new Map([['sq|', 10]]) }).weightKg).toBe(50);
  });
});

describe('suggestNext fixes', () => {
  const two = (a: S[], b: S[], d1 = 14, d2 = 7) => [wk(d1, a), wk(d2, b)];
  it('keeps reps within range for weighted exercises on every path', () => {
    expect(suggest('sq', two([[60, 14]], [[60, 15], [60, 15]]), NOW)).toEqual({ weightKg: 62.5, reps: 6, why: 'progress' });
    expect(suggest('sq', [wk(7, [[60, 15]])], NOW)).toEqual({ weightKg: 60, reps: 12, why: 'keep' });
    expect(suggest('sq', [wk(7, [[60, 3]])], NOW)).toEqual({ weightKg: 60, reps: 6, why: 'keep' });
    expect(suggest('sq', [wk(40, [[60, 15]])], NOW)).toEqual({ weightKg: 52.5, reps: 12, why: 'step-back' });
    expect(suggest('sq', [wk(40, [[60, 3]])], NOW)).toEqual({ weightKg: 52.5, reps: 6, why: 'step-back' });
    expect(suggest('sq', two([[60, 3]], [[60, 4]]), NOW)).toEqual({ weightKg: 60, reps: 6, why: 'progress' });
  });
  it('a lower weight in the last session is not reached', () => {
    expect(suggest('sq', two([[60, 8]], [[55, 9]]), NOW)).toEqual({ weightKg: 55, reps: 9, why: 'keep' });
  });
  it('a break of exactly 28 days is none, 29 days steps back', () => {
    expect(suggest('sq', [wk(28, [[60, 8]])], NOW).why).toBe('keep');
    expect(suggest('sq', [wk(29, [[60, 8]])], NOW).why).toBe('step-back');
  });
  it('sessions at exactly 56 days are comparable, at 57 days not', () => {
    expect(suggest('sq', two([[60, 8]], [[60, 9]], 56, 7), NOW).why).toBe('progress');
    expect(suggest('sq', two([[60, 8]], [[60, 9]], 57, 7), NOW).why).toBe('keep');
  });
  it('failure sets count toward reached, drop sets and warmups are ignored', () => {
    expect(suggest('sq', two([[60, 8]], [[60, 8], [60, 5, 'failure']]), NOW).why).toBe('keep');
    expect(suggest('sq', two([[60, 8]], [[60, 9], [60, 8, 'failure']]), NOW).why).toBe('progress');
    expect(suggest('sq', two([[60, 8]], [[60, 8], [40, 3, 'dropset'], [80, 2, 'dropset']]), NOW)).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('step-back on bodyweight keeps weight null', () => {
    expect(suggest('pu', [wk(40, [[null, 10]], 'pu')], NOW)).toEqual({ weightKg: null, reps: 10, why: 'step-back' });
  });
  it('bodyweight reps may exceed the range max and never fall below 1', () => {
    expect(suggest('pu', [wk(7, [[null, 20]], 'pu')], NOW).reps).toBe(20);
    expect(suggest('pu', [wk(7, [[null, 1]], 'pu')], NOW).reps).toBe(1);
  });
  it('after a weight rise the next suggestion keeps the weight', () => {
    expect(suggest('sq', two([[40, 12]], [[42.5, 6]]), NOW)).toEqual({ weightKg: 42.5, reps: 6, why: 'keep' });
  });
  it('availableExercises ignores workouts after now', () => {
    const r = availableExercises([wk(-2, [[60, 8]], 'fut', 'Future'), wk(5, [[60, 8]], 'sq')], NOW);
    expect(r.map((x) => x.templateId)).toEqual(['sq']);
  });
});

describe('the exercise types Hevy really sends', () => {
  const template = (type: string) => ({ id: 't', title: 'Invented', type, primaryMuscle: 'lats', equipment: 'none' });
  it('counts weighted and assisted bodyweight exercises as rep-based', () => {
    for (const type of ['bodyweight_weighted', 'bodyweight_assisted', 'bodyweight_assisted_reps']) expect(isRepBased(template(type)), type).toBe(true);
    for (const type of ['duration', 'distance_duration', 'short_distance_weight', 'floors_duration', 'steps_duration']) expect(isRepBased(template(type)), type).toBe(false);
  });
  it('treats both assisted names as assisted', () => {
    expect(isAssisted('bodyweight_assisted')).toBe(true);
    expect(isAssisted('bodyweight_assisted_reps')).toBe(true);
    expect(isAssisted('bodyweight_weighted')).toBe(false);
  });
});
