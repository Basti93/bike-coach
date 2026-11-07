import { EXERCISES } from '../../src/shared/exercises';
import { readWorkoutChange } from '../../src/shared/chat';
import { confirmSet, linkWith, moveExercise, startFromPlan, type TrackedWorkout } from '../../src/tracking/session';
import { takeChange, undoChange } from '../../src/tracking/workout-change';
import type { GymWorkout } from '../../src/coach/gym/types';

const ex = (id: string, title: string) => ({ templateId: id, title, restS: null, supersetId: null, notes: '', sets: [1, 2].map(() => ({ type: 'normal' as const, weightKg: 50, reps: 8 })) });
const plan: GymWorkout = { name: 'P', exercises: [ex('pf-bench-press', 'A'), ex('pf-squat', 'B'), ex('pf-leg-press', 'C'), ex('pf-bench-press', 'D')] };
const start = (): TrackedWorkout => startFromPlan(plan, [], 0, 'w1');
const titles = (w: TrackedWorkout) => w.exercises.map((e) => e.title).join('');
const rid = (w: TrackedWorkout, i: number) => w.exercises[i]!.rid;

test('moves up and down, ends and unknown rows change nothing', () => {
  const w = start();
  expect(titles(moveExercise(w, rid(w, 1), -1))).toBe('BACD');
  expect(titles(moveExercise(w, rid(w, 1), 1))).toBe('ACBD');
  expect(moveExercise(w, rid(w, 0), -1)).toBe(w);
  expect(moveExercise(w, rid(w, 3), 1)).toBe(w);
  expect(moveExercise(w, 'nope', 1)).toBe(w);
});

test('a group moves as one block past a single exercise or a group', () => {
  let w = start();
  w = linkWith(w, rid(w, 1), rid(w, 2)); // B+C
  const down = moveExercise(w, rid(w, 1), 1);
  expect(titles(down)).toBe('ADBC');
  expect(titles(moveExercise(w, rid(w, 2), -1))).toBe('BCAD');
  const x = start();
  const both = linkWith(linkWith(x, rid(x, 2), rid(x, 3)), rid(x, 0), rid(x, 1)); // A+B, C+D
  expect(titles(moveExercise(both, rid(both, 0), 1))).toBe('CDAB');
});

test('rows stay intact and done sets stay with their exercise', () => {
  const w0 = start();
  const w = confirmSet(w0, rid(w0, 1), w0.exercises[1]!.sets[0]!.rid, 5);
  const m = moveExercise(w, rid(w, 1), -1);
  expect(m.exercises[0]).toBe(w.exercises[1]);
  expect(m.exercises[0]!.sets[0]!.doneMs).toBe(5);
});

const taken = (w: TrackedWorkout, ops: object[]) =>
  takeChange(w, 'c1', readWorkoutChange({ workoutId: 'w1', ops })!, [], EXERCISES, { renames: [], picks: [] } as never, 9);

test('undo after a move restores rows next to their anchor', () => {
  const w = start();
  const t = taken(w, [{ op: 'drop', ex: rid(w, 2) }]).workout; // A B D
  const b = t.exercises.find((e) => e.title === 'B')!;
  expect(t.changes![0]!.anchor).toBe(b.rid);
  const moved = moveExercise(moveExercise(t, rid(t, 0), 1), rid(t, 0), 1); // B D A
  expect(titles(moved)).toBe('BDA');
  const u = undoChange(moved, 'c1');
  expect(u.refusal).toBeNull();
  expect(titles(u.workout)).toBe('BCDA');
});

test('undo leaves no group of one member behind', () => {
  const w = start();
  const t = taken(w, [{ op: 'drop', ex: rid(w, 1) }]).workout; // A C D
  const grouped = linkWith(t, rid(t, 0), rid(t, 1)); // A+C
  const lone = { ...grouped, exercises: grouped.exercises.filter((e) => e.title !== 'C') }; // A alone, still in a group id
  expect(lone.exercises[0]!.supersetId).not.toBeNull();
  const u = undoChange(lone, 'c1').workout; // B comes back between A and D
  expect(u.exercises.map((e) => e.supersetId).every((g) => g === null)).toBe(true);
});

test('an anchor of null means the start; an entry without anchor uses pos', () => {
  const w = start();
  const t0 = taken(w, [{ op: 'drop', ex: rid(w, 0) }]).workout; // B C D
  expect(t0.changes![0]!.anchor).toBeNull();
  expect(titles(undoChange(moveExercise(t0, rid(t0, 2), -1), 'c1').workout)).toBe('ABDC');
  const t = taken(w, [{ op: 'drop', ex: rid(w, 1) }]).workout; // A C D
  const old = { ...t, changes: t.changes!.map(({ anchor: _a, ...c }) => c) };
  expect(titles(undoChange(moveExercise(old, rid(old, 0), 1), 'c1').workout)).toBe('CBAD');
});
