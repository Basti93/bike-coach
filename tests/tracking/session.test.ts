import {
  addExercise, addSet, confirmSet, editSet, finish, lastValues, parseDecimal, formatDecimal, removeExercise, removeSet,
  startEmpty, startFromPlan, startFromRoutine, swapExercise, restRemainingS, ensureIds, editNotes,
} from '../../src/tracking/session';
import type { LoggedWorkout } from '../../src/shared/records';
import type { GymWorkout } from '../../src/coach/gym/types';

const done = (weightKg: number | null, reps: number | null, doneMs: number | null = 1000, type: 'normal' | 'warmup' = 'normal') => ({ type, weightKg, reps, durationS: null, doneMs });
const past = (id: string, endMs: number, exerciseId: string, sets: ReturnType<typeof done>[], extra: Partial<LoggedWorkout> = {}): LoggedWorkout => ({
  id, title: 'Alt', startMs: endMs - 1000, endMs, source: 'pandafit',
  exercises: [{ exerciseId, title: 'X', supersetId: null, notes: '', sets }], ...extra,
});
const plan: GymWorkout = { name: 'Oberkörper', exercises: [
  { templateId: 'pf-bench-press', title: 'Bankdrücken', restS: 120, supersetId: null, notes: '', sets: [
    { type: 'normal', weightKg: 50, reps: null, repRange: { start: 8, end: 12 } },
    { type: 'normal', weightKg: null, reps: null, repRange: { start: 8, end: 12 } },
  ] },
] };
const ex0 = (w: ReturnType<typeof startEmpty>) => w.exercises[0].rid;
const set0 = (w: ReturnType<typeof startEmpty>, i = 0) => w.exercises[0].sets[i].rid;

test('prefills last values, with weight empty when there are none', () => {
  const hist = [past('h1', 5000, 'pf-bench-press', [done(40, 10), done(42.5, 9)]), past('h0', 1000, 'pf-bench-press', [done(10, 5)])];
  const w = startFromRoutine({ name: 'R', exercises: [{ templateId: 'pf-bench-press', title: 'Bankdrücken', restS: null, supersetId: null, notes: '', sets: [
    { type: 'normal', weightKg: null, reps: null }, { type: 'normal', weightKg: null, reps: null }] }] }, hist, 10, 'w1');
  expect(w.exercises[0].sets.map((s) => [s.weightKg, s.reps, s.doneMs])).toEqual([[40, 10, null], [42.5, 9, null]]);
  const fresh = startFromRoutine({ name: 'R', exercises: [plan.exercises[0]] }, [], 10, 'w2');
  expect(fresh.exercises[0].sets[1].weightKg).toBeNull();
  expect(w.endMs).toBeNull();
});

test('plan values win for a planned exercise', () => {
  const hist = [past('h1', 5000, 'pf-bench-press', [done(40, 10), done(42.5, 9)])];
  const sets = startFromPlan(plan, hist, 10, 'w1').exercises[0].sets;
  expect(sets[0].weightKg).toBe(50);
  expect(sets[0].reps).toBe(8);
  expect(sets[0].repRange).toEqual({ start: 8, end: 12 });
  expect(sets[1].weightKg).toBe(42.5);
});

test('warmups never prefill a working set', () => {
  const hist = [past('h1', 5000, 'pf-bench-press', [done(20, 10, 1000, 'warmup'), done(60, 8)])];
  const r: GymWorkout = { name: 'R', exercises: [{ templateId: 'pf-bench-press', title: 'B', restS: null, supersetId: null, notes: '', sets: [
    { type: 'normal', weightKg: null, reps: null }] }] };
  expect(startFromRoutine(r, hist, 1, 'w').exercises[0].sets[0].weightKg).toBe(60);
});

test('lastValues counts one performed session once, own winning over an overlapping Hevy one', () => {
  const own = past('own', 100_000, 'pf-squat', [done(100, 5)], { startMs: 40_000 });
  const hevy = past('hv', 110_000, 'pf-squat', [done(999, 1)], { startMs: 50_000, source: 'hevy' });
  expect(lastValues('pf-squat', [hevy, own]).map((s) => s.weightKg)).toEqual([100]);
  const later = past('hv2', 900_000_000, 'pf-squat', [done(70, 5)], { source: 'hevy' });
  expect(lastValues('pf-squat', [own, later]).map((s) => s.weightKg)).toEqual([70]);
});

test('lastValues only counts confirmed sets of the newest finished workout', () => {
  const open: LoggedWorkout = { ...past('o', 9000, 'a', [done(1, 1)]), endMs: null };
  const hist = [open, past('h', 5000, 'a', [done(30, 8), done(99, 1, null)])];
  expect(lastValues('a', hist).map((s) => s.weightKg)).toEqual([30]);
  expect(lastValues('none', hist)).toEqual([]);
});

test('confirming marks the set done and starts the rest timer', () => {
  const w = startFromPlan(plan, [], 10, 'w1');
  const c = confirmSet(w, ex0(w), set0(w), 5000);
  expect(c.exercises[0].sets[0].doneMs).toBe(5000);
  expect(c.rest).toEqual({ startMs: 5000, durationS: 120 });
  expect(restRemainingS(c, 5000 + 30_000)).toBe(90);
  expect(restRemainingS(c, 5000 + 200_000)).toBe(0);
  expect(w.exercises[0].sets[0].doneMs).toBeNull();
});

test('sets can be edited, added and removed by stable id', () => {
  let w = startEmpty(1, 'w', 'Frei');
  w = addExercise(w, { id: 'e', title: 'E', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'none' }, []);
  const e = ex0(w);
  w = editSet(w, e, set0(w), { weightKg: 12.5, reps: 8 });
  w = addSet(w, e);
  expect(w.exercises[0].sets[1]).toMatchObject({ weightKg: 12.5, reps: 8, doneMs: null });
  expect(w.exercises[0].sets[1].rid).not.toBe(set0(w));
  w = removeSet(w, e, set0(w));
  expect(w.exercises[0].sets).toHaveLength(1);
  w = removeExercise(w, e);
  expect(w.exercises).toHaveLength(0);
});

test('a stale id does nothing, so a double tap never removes the next row', () => {
  let w = startFromPlan(plan, [], 10, 'w1');
  const e = ex0(w), s = set0(w);
  w = removeSet(w, e, s);
  expect(w.exercises[0].sets).toHaveLength(1);
  expect(removeSet(w, e, s)).toBe(w);
  w = removeExercise(w, e);
  expect(removeExercise(w, e)).toBe(w);
  expect(confirmSet(w, 'nope', 'nope', 1)).toBe(w);
});

test('ensureIds gives old records stable row ids once', () => {
  const old = past('x', 5000, 'a', [done(1, 1)]) as unknown as Parameters<typeof ensureIds>[0];
  const a = ensureIds(old);
  expect(a.exercises[0].rid).toBeTruthy();
  expect(a.exercises[0].sets[0].rid).toBeTruthy();
  expect(ensureIds(a)).toBe(a);
});

test('an exercise can be swapped and what happened counts', () => {
  let w = startFromPlan(plan, [], 10, 'w1');
  w = editNotes(w, ex0(w), 'Schulter zwickt');
  w = confirmSet(w, ex0(w), set0(w), 100);
  const alt = { id: 'pf-chest-press-machine', title: 'Brustpresse', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'machine' };
  const s = swapExercise(w, ex0(w), alt, []);
  expect(s.exercises.map((e) => e.exerciseId)).toEqual(['pf-bench-press', 'pf-chest-press-machine']);
  expect(s.exercises[0].sets).toHaveLength(1);
  expect(s.exercises[1].notes).toBe(''); // notes belong to the old exercise
  expect(s.exercises[1].restS).toBe(120); // rest is kept
  const none = swapExercise(startFromPlan(plan, [], 10, 'w2'), startFromPlan(plan, [], 10, 'w2').exercises[0].rid, alt, []);
  expect(none).toBeDefined();
});

test('finish without confirmed sets asks first and never deletes silently', () => {
  const w = startFromPlan(plan, [], 10, 'w1');
  expect(finish(w, 99)).toEqual({ status: 'ask', question: 'nothing-confirmed' });
  expect(finish(w, 99, 'discard')).toEqual({ status: 'discard' });
  const one = confirmSet(w, ex0(w), set0(w), 50);
  expect(finish(one, 99)).toEqual({ status: 'ask', question: 'open-sets', open: 1 });
  expect(finish(one, 99, 'discard').status).not.toBe('discard'); // a confirmed set blocks discarding
  const omit = finish(one, 99, 'omit');
  expect(omit.status === 'finished' && omit.workout.exercises[0].sets.map((s) => s.doneMs)).toEqual([50, null]);
  const comp = finish(one, 99, 'complete');
  expect(comp.status === 'finished' && comp.workout.exercises[0].sets.map((s) => s.doneMs)).toEqual([50, 99]);
  const none = finish(w, 99, 'complete');
  expect(none.status === 'finished' && none.workout.exercises[0].sets.every((s) => s.doneMs === 99)).toBe(true);
  expect(finish(confirmSet(one, ex0(one), set0(one, 1), 60), 99).status).toBe('finished');
});

test('finishing a workout left open for hours ends it at its last confirmed set, not now', () => {
  const H = 3_600_000;
  const base = startFromPlan(plan, [], 10, 'w1');
  const one = confirmSet(base, ex0(base), set0(base), 1_000_000);
  const now = 1_000_000 + 7 * H;
  const r = finish(one, now, 'complete');
  expect(r.status === 'finished' && r.workout.endMs).toBe(1_000_000);
  expect(r.status === 'finished' && r.workout.exercises[0].sets.map((s) => s.doneMs)).toEqual([1_000_000, 1_000_000]);
  const fresh = finish(one, 1_000_000 + 2 * H, 'complete');
  expect(fresh.status === 'finished' && fresh.workout.endMs).toBe(1_000_000 + 2 * H);
});

test('decimal comma and dot both parse; display uses a comma', () => {
  expect(parseDecimal('62,5')).toBe(62.5);
  expect(parseDecimal('62.5')).toBe(62.5);
  expect(parseDecimal('')).toBeNull();
  expect(parseDecimal('abc')).toBeUndefined();
  expect(formatDecimal(62.5)).toBe('62,5');
  expect(formatDecimal(null)).toBe('');
});
