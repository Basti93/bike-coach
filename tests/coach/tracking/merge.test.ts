import { describe, it, expect } from 'vitest';
import { toStrengthWorkout, mergeHistory, historyFromLogged } from '../../../src/coach/tracking/merge';
import type { LoggedWorkout } from '../../../src/shared/records';
import type { StrengthWorkout } from '../../../src/coach/hevy';

const set = (type: 'warmup' | 'normal', weightKg: number, reps: number) => ({ type, weightKg, reps, durationS: null, doneMs: null });
const logged = (id: string, startMs: number, endMs: number | null): LoggedWorkout => ({
  id, title: 'Beine', startMs, endMs, source: 'pandafit',
  exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [set('warmup', 20, 10), set('normal', 100, 5), set('normal', 100, 4)] }],
});
const hevy = (id: string, startMs: number, durationS: number): StrengthWorkout => ({ id, title: 'Legs', startMs, durationS, exercises: [] });
const H = 3_600_000;

describe('toStrengthWorkout', () => {
  it('warmup sets do not count toward volume', () => {
    const w = toStrengthWorkout(logged('a', 0, 3600_000));
    const e = w.exercises[0];
    expect(w.id).toBe('a');
    expect(w.durationS).toBe(3600);
    expect(e.templateId).toBe('pf-squat');
    expect(e.sets).toBe(2);
    expect(e.reps).toBe(9);
    expect(e.volumeKg).toBe(900);
    expect(e.workSets).toHaveLength(3);
    expect(e.workSets[0]).toEqual({ type: 'warmup', weightKg: 20, reps: 10 });
  });
  it('maps the exercise id to the Hevy id when linked', () => {
    const w = toStrengthWorkout(logged('a', 0, H), new Map([['pf-squat', 'HX']]));
    expect(w.exercises[0].templateId).toBe('HX');
  });
});

describe('mergeHistory', () => {
  it('a Pandafit workout overlapping a Hevy one by at least half counts once and Pandafit wins', () => {
    const own = toStrengthWorkout(logged('own', 0, H));
    const merged = mergeHistory([own], [hevy('h', 20 * 60_000, 3600)]);
    expect(merged.map((w) => w.id)).toEqual(['own']);
  });
  it('back-to-back workouts both stay', () => {
    const own = toStrengthWorkout(logged('own', 0, H));
    const merged = mergeHistory([own], [hevy('h', H, 3600)]);
    expect(merged.map((w) => w.id)).toEqual(['own', 'h']);
  });
  it('a small overlap keeps both', () => {
    const own = toStrengthWorkout(logged('own', 0, H));
    expect(mergeHistory([own], [hevy('h', 50 * 60_000, 3600)])).toHaveLength(2);
  });
  it('an open workout is left out of the history', () => {
    expect(historyFromLogged([logged('open', 0, null), logged('done', H, 2 * H)]).map((w) => w.id)).toEqual(['done']);
  });
  it('one exercise keeps one id when own and Hevy are linked', () => {
    const links = new Map([['pf-squat', 'HX']]);
    const own = toStrengthWorkout(logged('own', 5 * H, 6 * H));
    const h: StrengthWorkout = { id: 'h', title: 'x', startMs: 0, durationS: 3600, exercises: [{ title: 'Squat', templateId: 'HX', sets: 1, reps: 5, volumeKg: 1, workSets: [] }] };
    const merged = mergeHistory([own], [h], links);
    expect(merged.flatMap((w) => w.exercises.map((e) => e.templateId))).toEqual(['HX', 'HX']);
  });
});
