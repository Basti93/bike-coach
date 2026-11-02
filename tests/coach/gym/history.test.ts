import { describe, expect, it } from 'vitest';
import type { StrengthWorkout, SetType } from '../../../src/coach/hevy';
import { availableExercises, recentLegWork, suggestNext } from '../../../src/coach/gym/history';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 2, 12);
type S = [number | null, number, SetType?];
const wk = (daysAgo: number, sets: S[], templateId = 'sq', title = 'Squat'): StrengthWorkout => ({
  id: `w${daysAgo}${templateId}`, title: 'Day', startMs: NOW - daysAgo * DAY, durationS: 3600,
  exercises: [{ title, templateId, sets: sets.length, reps: 0, volumeKg: 0, workSets: sets.map(([weightKg, reps, type]) => ({ type: type ?? 'normal', weightKg, reps })) }],
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
