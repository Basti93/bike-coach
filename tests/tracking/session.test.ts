import {
  addExercise, addSet, confirmSet, editSet, finish, lastValues, parseDecimal, formatDecimal, removeExercise, removeSet,
  startEmpty, startFromPlan, startFromRoutine, swapExercise, restRemainingS,
} from '../../src/tracking/session';
import { createWorkoutStore } from '../../src/tracking/store';
import type { TrackingPort } from '../../src/tracking/ports';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import type { GymWorkout } from '../../src/coach/gym/types';

const done = (weightKg: number | null, reps: number | null, doneMs: number | null = 1000) => ({ type: 'normal' as const, weightKg, reps, durationS: null, doneMs });
const past = (id: string, endMs: number, exerciseId: string, sets: ReturnType<typeof done>[]): LoggedWorkout => ({
  id, title: 'Alt', startMs: endMs - 1000, endMs, source: 'pandafit',
  exercises: [{ exerciseId, title: 'X', supersetId: null, notes: '', sets }],
});
const plan: GymWorkout = { name: 'Oberkörper', exercises: [
  { templateId: 'pf-bench-press', title: 'Bankdrücken', restS: 120, supersetId: null, notes: '', sets: [
    { type: 'normal', weightKg: 50, reps: null, repRange: { start: 8, end: 12 } },
    { type: 'normal', weightKg: null, reps: null, repRange: { start: 8, end: 12 } },
  ] },
] };

test('prefills last values, with weight empty when there are none', () => {
  const hist = [past('h1', 5000, 'pf-bench-press', [done(40, 10), done(42.5, 9)]), past('h0', 1000, 'pf-bench-press', [done(10, 5)])];
  const w = startFromRoutine({ name: 'R', exercises: [{ templateId: 'pf-bench-press', title: 'Bankdrücken', restS: null, supersetId: null, notes: '', sets: [
    { type: 'normal', weightKg: null, reps: null }, { type: 'normal', weightKg: null, reps: null }] }] }, hist, 10, 'w1');
  expect(w.exercises[0].sets.map((s) => [s.weightKg, s.reps, s.doneMs])).toEqual([[40, 10, null], [42.5, 9, null]]);
  const fresh = startFromRoutine({ name: 'R', exercises: [plan.exercises[0]] }, [], 10, 'w2');
  expect(fresh.exercises[0].sets[1].weightKg).toBeNull();
  expect(fresh.exercises[0].sets.every((s) => s.weightKg !== 0 && s.reps !== 0)).toBe(true);
  expect(w.endMs).toBeNull();
  expect(w.id).toBe('w1');
});

test('plan values win for a planned exercise', () => {
  const hist = [past('h1', 5000, 'pf-bench-press', [done(40, 10), done(42.5, 9)])];
  const w = startFromPlan(plan, hist, 10, 'w1');
  const sets = w.exercises[0].sets;
  expect(sets[0].weightKg).toBe(50); // plan wins
  expect(sets[0].reps).toBe(8); // range start
  expect(sets[0].repRange).toEqual({ start: 8, end: 12 });
  expect(sets[1].weightKg).toBe(42.5); // plan empty -> history
  expect(w.title).toBe('Oberkörper');
});

test('lastValues only counts confirmed sets of the newest finished workout', () => {
  const open: LoggedWorkout = { ...past('o', 9000, 'a', [done(1, 1)]), endMs: null };
  const hist = [open, past('h', 5000, 'a', [done(30, 8), { ...done(99, 1), doneMs: null }])];
  expect(lastValues('a', hist).map((s) => s.weightKg)).toEqual([30]);
  expect(lastValues('none', hist)).toEqual([]);
});

test('confirming marks the set done and starts the rest timer', () => {
  const w = startFromPlan(plan, [], 10, 'w1');
  const c = confirmSet(w, 0, 0, 5000);
  expect(c.exercises[0].sets[0].doneMs).toBe(5000);
  expect(c.rest).toEqual({ startMs: 5000, durationS: 120 });
  expect(restRemainingS(c, 5000 + 30_000)).toBe(90);
  expect(restRemainingS(c, 5000 + 200_000)).toBe(0);
  expect(w.exercises[0].sets[0].doneMs).toBeNull(); // pure
});

test('sets can be edited, added and removed', () => {
  let w = startEmpty(1, 'w', 'Frei');
  w = addExercise(w, { id: 'e', title: 'E', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'none' }, []);
  w = editSet(w, 0, 0, { weightKg: 12.5, reps: 8 });
  w = addSet(w, 0);
  expect(w.exercises[0].sets[1]).toMatchObject({ weightKg: 12.5, reps: 8, doneMs: null });
  w = removeSet(w, 0, 0);
  expect(w.exercises[0].sets).toHaveLength(1);
  w = removeExercise(w, 0);
  expect(w.exercises).toHaveLength(0);
});

test('an exercise can be swapped and what happened counts', () => {
  let w = startFromPlan(plan, [], 10, 'w1');
  w = confirmSet(w, 0, 0, 100);
  const alt = { id: 'pf-chest-press-machine', title: 'Brustpresse', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'machine' };
  const s = swapExercise(w, 0, alt, []);
  expect(s.exercises.map((e) => e.exerciseId)).toEqual(['pf-bench-press', 'pf-chest-press-machine']);
  expect(s.exercises[0].sets.filter((x) => x.doneMs !== null)).toHaveLength(1);
  expect(s.exercises[0].sets).toHaveLength(1); // unconfirmed leftovers move away
  const none = swapExercise(startFromPlan(plan, [], 10, 'w2'), 0, alt, []);
  expect(none.exercises.map((e) => e.exerciseId)).toEqual(['pf-chest-press-machine']);
});

test('finish without confirmed sets asks first and never deletes silently', () => {
  const w = startFromPlan(plan, [], 10, 'w1');
  expect(finish(w, 99)).toEqual({ status: 'ask', question: 'nothing-confirmed' });
  expect(finish(w, 99, 'discard')).toEqual({ status: 'discard' });
  const one = confirmSet(w, 0, 0, 50);
  expect(finish(one, 99)).toEqual({ status: 'ask', question: 'open-sets', open: 1 });
  const omit = finish(one, 99, 'omit');
  expect(omit.status === 'finished' && omit.workout.exercises[0].sets.map((s) => s.doneMs)).toEqual([50, null]);
  const comp = finish(one, 99, 'complete');
  expect(comp.status === 'finished' && comp.workout.exercises[0].sets.map((s) => s.doneMs)).toEqual([50, 99]);
  if (comp.status === 'finished') { expect(comp.workout.endMs).toBe(99); expect(comp.workout.rest ?? null).toBeNull(); }
  const all = confirmSet(one, 0, 1, 60);
  expect(finish(all, 99).status).toBe('finished');
});

test('decimal comma and dot both parse; display uses a comma', () => {
  expect(parseDecimal('62,5')).toBe(62.5);
  expect(parseDecimal('62.5')).toBe(62.5);
  expect(parseDecimal('')).toBeNull();
  expect(parseDecimal('abc')).toBeUndefined();
  expect(formatDecimal(62.5)).toBe('62,5');
  expect(formatDecimal(null)).toBe('');
});

function port(): TrackingPort & { puts: TrackedRecord[]; fail: { on: boolean }; gate: { wait: Promise<void> | null } } {
  const puts: TrackedRecord[] = []; const fail = { on: false }; const gate = { wait: null as Promise<void> | null };
  return {
    puts, fail, gate,
    list: async () => [],
    put: async (r) => { if (gate.wait) await gate.wait; if (fail.on) throw new Error('disk'); puts.push(r); },
    subscribe: () => () => {},
    syncState: () => ({ pending: 0, lastOkMs: null }),
  };
}

test('every action calls put before the UI updates', async () => {
  const p = port();
  let release!: () => void;
  p.gate.wait = new Promise<void>((r) => { release = r; });
  const store = createWorkoutStore(p, startFromPlan(plan, [], 10, 'w1'), () => 777);
  const job = store.apply((w) => confirmSet(w, 0, 0, 5));
  expect(store.view().workout.exercises[0].sets[0].doneMs).toBeNull(); // not shown yet
  release();
  expect(await job).toBe(true);
  expect(store.view().workout.exercises[0].sets[0].doneMs).toBe(5);
  expect(store.view().save).toBe('saved');
  expect(p.puts[0]).toMatchObject({ kind: 'workout', id: 'w1', deleted: false, updatedMs: 777 });
  expect((p.puts[0].body as LoggedWorkout).exercises[0].sets[0].doneMs).toBe(5);
});

test('a failing put keeps the state in memory and the next action retries everything', async () => {
  const p = port();
  const store = createWorkoutStore(p, startFromPlan(plan, [], 10, 'w1'), () => 1);
  p.fail.on = true;
  expect(await store.apply((w) => confirmSet(w, 0, 0, 5))).toBe(false);
  expect(store.view().save).toBe('unsaved');
  expect(store.view().workout.exercises[0].sets[0].doneMs).toBe(5); // kept
  p.fail.on = false;
  expect(await store.apply((w) => confirmSet(w, 0, 1, 6))).toBe(true);
  expect(store.view().save).toBe('saved');
  const body = p.puts.at(-1)!.body as LoggedWorkout;
  expect(body.exercises[0].sets.map((s) => s.doneMs)).toEqual([5, 6]);
});

test('remove writes a tombstone, never a silent delete', async () => {
  const p = port();
  const store = createWorkoutStore(p, startEmpty(1, 'w9', 'Frei'), () => 3);
  expect(await store.remove()).toBe(true);
  expect(p.puts.at(-1)).toMatchObject({ kind: 'workout', id: 'w9', deleted: true });
});
