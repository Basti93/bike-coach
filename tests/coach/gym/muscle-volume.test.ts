import { describe, expect, it } from 'vitest';
import { muscleGroupOf, weeklySetRange, MUSCLE_TARGETS } from '../../../src/shared/muscle-targets';
import { muscleVolume } from '../../../src/coach/gym/muscle-volume';
import { buildGymPrompt, GYM_SYSTEM_PROMPT } from '../../../src/coach/gym/prompt';
import { initialGymState } from '../../../src/coach/gym/state';
import type { StrengthWorkout } from '../../../src/coach/hevy';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 3, 12);

describe('muscleGroupOf', () => {
  it('splits the shoulders by the kind of exercise', () => {
    expect(muscleGroupOf({ title: 'Lateral Raise (Dumbbell)', primaryMuscle: 'shoulders' })).toBe('side_rear_delts');
    expect(muscleGroupOf({ title: 'Seitheben Maschine Stehend', primaryMuscle: 'shoulders' })).toBe('side_rear_delts');
    expect(muscleGroupOf({ title: 'Rear Delt Reverse Fly (Machine)', primaryMuscle: 'shoulders' })).toBe('side_rear_delts');
    expect(muscleGroupOf({ title: 'Overhead Press (Barbell)', primaryMuscle: 'shoulders' })).toBe('front_delts');
  });
  it('joins lats and upper back, hamstrings and glutes, and knows nothing else', () => {
    expect(muscleGroupOf({ title: 'x', primaryMuscle: 'lats' })).toBe('back');
    expect(muscleGroupOf({ title: 'x', primaryMuscle: 'upper_back' })).toBe('back');
    expect(muscleGroupOf({ title: 'x', primaryMuscle: 'glutes' })).toBe('hams_glutes');
    expect(muscleGroupOf({ title: 'x', primaryMuscle: null })).toBe('other');
  });
});

describe('targets', () => {
  it('small muscles get higher reps than big compound groups', () => {
    expect(MUSCLE_TARGETS.side_rear_delts.reps.min).toBeGreaterThan(MUSCLE_TARGETS.chest.reps.max - 1);
    expect(MUSCLE_TARGETS.calves.reps.min).toBeGreaterThan(MUSCLE_TARGETS.quads.reps.min);
  });
  it('a muscle goal asks for more sets than other goals', () => {
    expect(weeklySetRange('chest', 'muscle')).toEqual({ min: 12, max: 18 });
    expect(weeklySetRange('chest', undefined)).toEqual({ min: 6, max: 8 });
    expect(weeklySetRange('biceps', 'muscle').max).toBeLessThan(weeklySetRange('back', 'muscle').max);
  });
});

const workout = (daysAgo: number, exercises: { templateId: string; title: string; sets: number; warmups?: number }[]): StrengthWorkout => ({
  id: `w${daysAgo}`, title: 'T', startMs: NOW - daysAgo * DAY, durationS: 3600,
  exercises: exercises.map((e) => ({
    title: e.title, templateId: e.templateId, sets: e.sets, reps: 10, volumeKg: 0,
    workSets: [
      ...Array.from({ length: e.warmups ?? 0 }, () => ({ type: 'warmup' as const, weightKg: 20, reps: 10 })),
      ...Array.from({ length: e.sets }, () => ({ type: 'normal' as const, weightKg: 50, reps: 10 })),
    ],
  })),
});
const templates = [
  { id: 'BP', title: 'Bench Press (Barbell)', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'barbell' },
  { id: 'LR', title: 'Lateral Raise (Dumbbell)', type: 'weight_reps', primaryMuscle: 'shoulders', equipment: 'dumbbell' },
];

describe('muscleVolume', () => {
  it('counts working sets per group for the last 7 days and the 4-week weekly average, without warm-ups', () => {
    const ws = [workout(2, [{ templateId: 'BP', title: 'Bench Press (Barbell)', sets: 4, warmups: 2 }]), workout(20, [{ templateId: 'BP', title: 'Bench Press (Barbell)', sets: 8 }]), workout(40, [{ templateId: 'BP', title: 'Bench Press (Barbell)', sets: 50 }])];
    const v = muscleVolume(ws, templates, NOW, 'muscle');
    const chest = v.find((g) => g.group === 'chest')!;
    expect(chest.last7Days).toBe(4);
    expect(chest.perWeek4Weeks).toBe(3);
    expect(chest.target).toEqual({ min: 12, max: 18 });
    expect(chest.reps).toEqual({ min: 6, max: 12 });
  });
  it('lists every group with a target, also untrained ones, and Sonstiges only when trained', () => {
    const v = muscleVolume([], templates, NOW, 'muscle');
    expect(v.find((g) => g.group === 'calves')?.last7Days).toBe(0);
    expect(v.some((g) => g.group === 'other')).toBe(false);
  });
});

describe('the gym prompt', () => {
  it('carries the muscle volume with targets and rep ranges as data', () => {
    const input = { state: initialGymState('p'), workouts: [workout(2, [{ templateId: 'LR', title: 'Lateral Raise (Dumbbell)', sets: 3 }])], templates, nowMs: NOW, summaries: [], complaints: [], previous: null, wantNote: false };
    const p = buildGymPrompt(input);
    expect(p).toContain('<muskelvolumen-nur-daten>');
    expect(p).toMatch(/"gruppe":"Schultern seitlich und hinten","saetze7Tage":3/);
    expect(GYM_SYSTEM_PROMPT).toMatch(/Block muskelvolumen/);
    expect(GYM_SYSTEM_PROMPT).toMatch(/5 bis 30 Wiederholungen/);
  });
});
