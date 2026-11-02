import { describe, it, expect } from 'vitest';
import { toStrengthWorkout, mergeHistory, historyFromLogged } from '../../../src/coach/tracking/merge';
import type { LoggedWorkout } from '../../../src/shared/records';
import type { StrengthWorkout } from '../../../src/coach/hevy';

const set = (type: 'warmup' | 'normal', weightKg: number, reps: number) => ({ type, weightKg, reps, durationS: null, doneMs: 1 });
const logged = (id: string, startMs: number, endMs: number | null): LoggedWorkout => ({
  id, title: 'Beine', startMs, endMs, source: 'pandafit',
  exercises: [{ exerciseId: 'pf-squat', title: 'Kniebeuge', supersetId: null, notes: '', sets: [set('warmup', 20, 10), set('normal', 100, 5), set('normal', 100, 4)] }],
});
const hevy = (id: string, startMs: number, durationS: number): StrengthWorkout => ({ id, title: 'Legs', startMs, durationS, exercises: [] });
const H = 3_600_000;
const NO = new Map<string, string>();

describe('toStrengthWorkout', () => {
  it('warmup sets do not count toward volume', () => {
    const w = toStrengthWorkout(logged('a', 0, 3600_000), NO);
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
  it('maps a Hevy template id to the own id when linked', () => {
    const l = logged('a', 0, H);
    l.exercises[0].exerciseId = 'HX';
    expect(toStrengthWorkout(l, new Map([['HX', 'pf-squat']])).exercises[0].templateId).toBe('pf-squat');
  });
  it('a plan of 4 sets with 2 confirmed gives 2 sets, and an exercise with none drops out', () => {
    const l = logged('a', 0, H);
    const s = (doneMs: number | null) => ({ type: 'normal' as const, weightKg: 50, reps: 5, durationS: null, doneMs });
    l.exercises[0].sets = [s(1), s(2), s(null), s(null)];
    l.exercises.push({ exerciseId: 'pf-plank', title: 'P', supersetId: null, notes: '', sets: [s(null)] });
    const w = toStrengthWorkout(l, NO);
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].sets).toBe(2);
    expect(w.exercises[0].reps).toBe(10);
    expect(w.exercises[0].volumeKg).toBe(500);
    expect(w.exercises[0].workSets).toHaveLength(2);
  });
  it('a Hevy-source workout keeps all sets', () => {
    const l = { ...logged('a', 0, H), source: 'hevy' as const };
    l.exercises[0].sets = [{ type: 'normal', weightKg: 50, reps: 5, durationS: null, doneMs: null }];
    expect(toStrengthWorkout(l, NO).exercises[0].sets).toBe(1);
  });
});

describe('mergeHistory', () => {
  it('a Pandafit workout overlapping a Hevy one by at least half counts once and Pandafit wins', () => {
    const own = toStrengthWorkout(logged('own', 0, H), NO);
    const merged = mergeHistory([own], [hevy('h', 20 * 60_000, 3600)], NO);
    expect(merged.map((w) => w.id)).toEqual(['own']);
  });
  it('back-to-back workouts both stay', () => {
    const own = toStrengthWorkout(logged('own', 0, H), NO);
    const merged = mergeHistory([own], [hevy('h', H, 3600)], NO);
    expect(merged.map((w) => w.id)).toEqual(['own', 'h']);
  });
  it('a small overlap keeps both', () => {
    const own = toStrengthWorkout(logged('own', 0, H), NO);
    expect(mergeHistory([own], [hevy('h', 50 * 60_000, 3600)], NO)).toHaveLength(2);
  });
  it('an open workout is left out of the history', () => {
    expect(historyFromLogged([logged('open', 0, null), logged('done', H, 2 * H)], NO).map((w) => w.id)).toEqual(['done']);
  });
  it('one exercise keeps one id when own and Hevy are linked, also for two Hevy templates with one title', () => {
    const links = new Map([['HX', 'pf-squat'], ['HY', 'pf-squat']]);
    const own = toStrengthWorkout(logged('own', 5 * H, 6 * H), links);
    const ex = (templateId: string) => ({ title: 'Squat', templateId, sets: 1, reps: 5, volumeKg: 1, workSets: [] });
    const h1: StrengthWorkout = { id: 'h1', title: 'x', startMs: 0, durationS: 3600, exercises: [ex('HX')] };
    const h2: StrengthWorkout = { id: 'h2', title: 'x', startMs: 2 * H, durationS: 3600, exercises: [ex('HY')] };
    const merged = mergeHistory([own], [h1, h2], links);
    expect(merged.flatMap((w) => w.exercises.map((e) => e.templateId))).toEqual(['pf-squat', 'pf-squat', 'pf-squat']);
  });
  it('a missing or NaN duration counts as 0, a point inside the other workout overlaps', () => {
    const own = toStrengthWorkout(logged('own', 0, H), NO);
    const point = { ...hevy('p', 30 * 60_000, 0), durationS: NaN };
    expect(mergeHistory([own], [point], NO).map((w) => w.id)).toEqual(['own']);
    const outside = hevy('q', 2 * H, 0);
    expect(mergeHistory([own], [outside], NO)).toHaveLength(2);
    const missing = { id: 'm', title: 'x', startMs: 10 * 60_000, exercises: [] } as unknown as StrengthWorkout;
    expect(mergeHistory([own], [missing], NO).map((w) => w.id)).toEqual(['own']);
    const pointOwn = { ...own, id: 'po', startMs: 5 * H, durationS: 0 };
    expect(mergeHistory([pointOwn], [hevy('big', 4 * H, 2 * 3600)], NO).map((w) => w.id)).toEqual(['po']);
  });
});

describe('hevyRecord links', () => {
  it('writes the own exercise id where a link exists and keeps the Hevy id otherwise', async () => {
    const { hevyRecord } = await import('../../../src/coach/tracking/hevy-import');
    const w = { id: 'h', title: 'T', startMs: 0, durationS: 60, exercises: [
      { title: 'Squat', templateId: 'HX', workSets: [{ type: 'normal' as const, weightKg: 1, reps: 1 }], sets: 1, reps: 1, volumeKg: 1 },
      { title: 'Other', templateId: 'HY', workSets: [], sets: 0, reps: 0, volumeKg: 0 }] };
    const r = hevyRecord(w, new Map([['HX', 'pf-squat']]));
    expect((r.body as { exercises: { exerciseId: string }[] }).exercises.map((e) => e.exerciseId)).toEqual(['pf-squat', 'HY']);
    expect(hevyRecord(w).body).not.toEqual(r.body);
  });
});
