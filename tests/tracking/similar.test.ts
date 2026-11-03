import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../src/shared/exercises';
import { matchesSearch, similarExercises } from '../../src/tracking/similar';

const ids = (title: string, exerciseId = 'hevy-template-x') => similarExercises({ title, exerciseId }, EXERCISES).map((e) => e.id);

describe('similarExercises', () => {
  it('puts the free-weight squats first for a Smith machine squat from Hevy', () => {
    const got = ids('Squat (Smith Machine)');
    expect(got[0]).toBe('pf-squat');
    expect(got.slice(0, 6)).toEqual(expect.arrayContaining(['pf-goblet-squat', 'pf-front-squat', 'pf-bulgarian-split-squat']));
  });

  it('puts both incline presses first for a Smith machine incline press', () => {
    expect(ids('Incline Bench Press (Smith Machine)').slice(0, 2).sort()).toEqual(['pf-incline-bench-press', 'pf-incline-press-db']);
  });

  it('only lists exercises of the same muscle or movement, never the exercise itself', () => {
    const got = similarExercises({ title: 'Kniebeuge', exerciseId: 'pf-squat' }, EXERCISES);
    expect(got.map((e) => e.id)).not.toContain('pf-squat');
    expect(got.every((e) => e.primaryMuscle === 'quadriceps' || /squat/i.test(e.hevyTitle ?? ''))).toBe(true);
    expect(got.length).toBeGreaterThan(0);
  });

  it('finds nothing for an unknown exercise', () => {
    expect(ids('Völlig eigene Übung')).toEqual([]);
  });
});

describe('matchesSearch', () => {
  it('finds own exercises by their English Hevy name', () => {
    const squat = EXERCISES.find((e) => e.id === 'pf-squat')!;
    expect(matchesSearch(squat, 'squat')).toBe(true);
    expect(matchesSearch(squat, 'kniebeuge')).toBe(true);
    expect(matchesSearch(squat, 'bench')).toBe(false);
  });
});
