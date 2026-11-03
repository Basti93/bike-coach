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

const withEffort = (w: StrengthWorkout, effort: 'none' | 'some' | 'plenty'): StrengthWorkout => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, effort })) });

describe('suggestNext with effort answers', () => {
  it('3+ left goes up even where the reps alone would keep', () => {
    const r = suggestNext('sq', [wk(14, [[60, 10], [60, 10]]), withEffort(wk(7, [[60, 10], [60, 8]]), 'plenty')], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('3+ left after a single session goes up too', () => {
    expect(suggestNext('sq', [withEffort(wk(7, [[60, 8], [60, 8]]), 'plenty')], NOW)).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('1-2 left changes nothing', () => {
    const plain = suggestNext('sq', [wk(14, [[60, 8], [60, 8]]), wk(7, [[60, 8], [60, 9]])], NOW);
    expect(suggestNext('sq', [wk(14, [[60, 8], [60, 8]]), withEffort(wk(7, [[60, 8], [60, 9]]), 'some')], NOW)).toEqual(plain);
  });
  it('0 left holds even where the reps alone would go up', () => {
    const r = suggestNext('sq', [wk(14, [[60, 8], [60, 8]]), withEffort(wk(7, [[60, 8], [60, 9]]), 'none')], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 8, why: 'keep' });
  });
  it('two 0 in a row hold, three step back', () => {
    const two = [withEffort(wk(14, [[60, 8], [60, 8]]), 'none'), withEffort(wk(7, [[60, 8], [60, 9]]), 'none')];
    expect(suggestNext('sq', two, NOW).why).toBe('keep');
    const three = [withEffort(wk(21, [[60, 8], [60, 8]]), 'none'), ...two];
    expect(suggestNext('sq', three, NOW)).toEqual({ weightKg: 54, reps: 8, why: 'step-back' });
  });
});

describe('suggestNext', () => {
  it('all reps reached twice in 56 days adds reps first', () => {
    const r = suggestNext('sq', [wk(14, [[60, 8], [60, 8]]), wk(7, [[60, 8], [60, 9]])], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('at REP_MAX the weight rises and reps go back to REP_MIN', () => {
    const r = suggestNext('sq', [wk(14, [[40, 11], [40, 11]]), wk(7, [[40, 12], [40, 12]])], NOW);
    expect(r).toEqual({ weightKg: 42.5, reps: 6, why: 'progress' });
  });
  it('keeps the value when the last session fell short', () => {
    const r = suggestNext('sq', [wk(14, [[60, 10], [60, 10]]), wk(7, [[60, 10], [60, 8]])], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 8, why: 'keep' });
  });
  it('one session is too little and keeps the last value', () => {
    expect(suggestNext('sq', [wk(7, [[60, 8]])], NOW)).toEqual({ weightKg: 60, reps: 8, why: 'keep' });
  });
  it('an older second session does not count as comparable', () => {
    expect(suggestNext('sq', [wk(60, [[60, 8]]), wk(7, [[60, 9]])], NOW).why).toBe('keep');
  });
  it('after 28 days without it the weight drops to 90 %', () => {
    expect(suggestNext('sq', [wk(40, [[60, 8]]), wk(35, [[60, 8]])], NOW)).toEqual({ weightKg: 54, reps: 8, why: 'step-back' });
  });
  it('no history gives no weight', () => {
    expect(suggestNext('sq', [], NOW)).toEqual({ weightKg: null, reps: 6, why: 'none' });
    expect(suggestNext('sq', [wk(3, [[50, 8]], 'other')], NOW).why).toBe('none');
  });
  it('bodyweight stays without weight and adds reps', () => {
    const r = suggestNext('pu', [wk(14, [[null, 12], [null, 12]], 'pu'), wk(7, [[null, 12], [null, 12]], 'pu')], NOW);
    expect(r).toEqual({ weightKg: null, reps: 13, why: 'progress' });
  });
  it('warmup sets do not count', () => {
    const r = suggestNext('sq', [wk(14, [[20, 12, 'warmup'], [60, 8]]), wk(7, [[100, 12, 'warmup'], [60, 8]])], NOW);
    expect(r).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('the step never exceeds 5 % or 2.5 kg', () => {
    for (const kg of [10, 20, 47.5, 60, 100, 137]) {
      const r = suggestNext('sq', [wk(14, [[kg, 12]]), wk(7, [[kg, 12]])], NOW);
      expect(r.weightKg! - kg).toBeLessThanOrEqual(Math.max(kg * 0.05, 2.5));
      expect(r.weightKg).toBeGreaterThan(kg);
      expect(r.weightKg! * 2 % 1).toBe(0);
    }
  });
  it('skips exercises without a template id', () => {
    expect(suggestNext('', [wk(7, [[60, 8]], '')], NOW).why).toBe('none');
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

describe('suggestNext fixes', () => {
  const two = (a: S[], b: S[], d1 = 14, d2 = 7) => [wk(d1, a), wk(d2, b)];
  it('keeps reps within range for weighted exercises on every path', () => {
    expect(suggestNext('sq', two([[60, 14]], [[60, 15], [60, 15]]), NOW)).toEqual({ weightKg: 63, reps: 6, why: 'progress' });
    expect(suggestNext('sq', [wk(7, [[60, 15]])], NOW)).toEqual({ weightKg: 60, reps: 12, why: 'keep' });
    expect(suggestNext('sq', [wk(7, [[60, 3]])], NOW)).toEqual({ weightKg: 60, reps: 6, why: 'keep' });
    expect(suggestNext('sq', [wk(40, [[60, 15]])], NOW)).toEqual({ weightKg: 54, reps: 12, why: 'step-back' });
    expect(suggestNext('sq', [wk(40, [[60, 3]])], NOW)).toEqual({ weightKg: 54, reps: 6, why: 'step-back' });
    expect(suggestNext('sq', two([[60, 3]], [[60, 4]]), NOW)).toEqual({ weightKg: 60, reps: 6, why: 'progress' });
  });
  it('a lower weight in the last session is not reached', () => {
    expect(suggestNext('sq', two([[60, 8]], [[55, 9]]), NOW)).toEqual({ weightKg: 55, reps: 9, why: 'keep' });
  });
  it('a break of exactly 28 days is none, 29 days steps back', () => {
    expect(suggestNext('sq', [wk(28, [[60, 8]])], NOW).why).toBe('keep');
    expect(suggestNext('sq', [wk(29, [[60, 8]])], NOW).why).toBe('step-back');
  });
  it('sessions at exactly 56 days are comparable, at 57 days not', () => {
    expect(suggestNext('sq', two([[60, 8]], [[60, 9]], 56, 7), NOW).why).toBe('progress');
    expect(suggestNext('sq', two([[60, 8]], [[60, 9]], 57, 7), NOW).why).toBe('keep');
  });
  it('failure sets count toward reached, drop sets and warmups are ignored', () => {
    expect(suggestNext('sq', two([[60, 8]], [[60, 8], [60, 5, 'failure']]), NOW).why).toBe('keep');
    expect(suggestNext('sq', two([[60, 8]], [[60, 9], [60, 8, 'failure']]), NOW).why).toBe('progress');
    expect(suggestNext('sq', two([[60, 8]], [[60, 8], [40, 3, 'dropset'], [80, 2, 'dropset']]), NOW)).toEqual({ weightKg: 60, reps: 9, why: 'progress' });
  });
  it('step-back on bodyweight keeps weight null', () => {
    expect(suggestNext('pu', [wk(40, [[null, 10]], 'pu')], NOW)).toEqual({ weightKg: null, reps: 10, why: 'step-back' });
  });
  it('bodyweight reps may exceed REP_MAX and never fall below 1', () => {
    expect(suggestNext('pu', [wk(7, [[null, 20]], 'pu')], NOW).reps).toBe(20);
    expect(suggestNext('pu', [wk(7, [[null, 1]], 'pu')], NOW).reps).toBe(1);
  });
  it('after a weight rise the next suggestion keeps the weight', () => {
    expect(suggestNext('sq', two([[40, 12]], [[42.5, 6]]), NOW)).toEqual({ weightKg: 42.5, reps: 6, why: 'keep' });
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
