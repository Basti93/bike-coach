import {
  addExercise, addSet, confirmSet, editSet, finish, hereKey, lastValues, parseDecimal, formatDecimal, removeExercise, removeSet,
  durationLabel, linkSuperset, unlinkSuperset, startEmpty, startFromPlan, startFromRoutine, swapExercise, restRemainingS, ensureIds, editNotes,
} from '../../src/tracking/session';
import type { LoggedWorkout } from '../../src/shared/records';
import { studioRecord, studioStateOf } from '../../src/shared/studio';
import { stepHere } from '../../src/tracking/steps';
import { mergeCatalog } from '../../src/shared/catalog';
import { EXERCISES } from '../../src/shared/exercises';
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

describe('durationLabel', () => {
  it('shows minutes and seconds, and hours once past an hour', () => {
    expect(durationLabel(0)).toBe('0:00');
    expect(durationLabel(99_000)).toBe('1:39');
    expect(durationLabel(3_725_000)).toBe('1:02:05');
    expect(durationLabel(-5_000)).toBe('0:00');
  });
});

describe('supersets', () => {
  const three: GymWorkout = { name: 'S', exercises: ['pf-bench-press', 'pf-squat', 'pf-lat-pulldown'].map((id) => ({
    templateId: id, title: id, restS: 90, supersetId: null, notes: '', sets: [{ type: 'normal' as const, weightKg: 20, reps: 10 }, { type: 'normal' as const, weightKg: 20, reps: 10 }],
  })) };
  const start = () => startFromPlan(three, [], 1000, 'w1');
  const groups = (w: ReturnType<typeof start>) => w.exercises.map((e) => e.supersetId);

  it('links an exercise with the next one, and a third joins the same group', () => {
    const w = start();
    const a = linkSuperset(w, w.exercises[0].rid);
    expect(groups(a)[0]).not.toBeNull();
    expect(groups(a)[0]).toBe(groups(a)[1]);
    expect(groups(a)[2]).toBeNull();
    const b = linkSuperset(a, a.exercises[1].rid);
    expect(new Set(groups(b)).size).toBe(1);
    expect(linkSuperset(b, b.exercises[2].rid)).toBe(b); // the last one has no next exercise
  });

  it('gives a new group a number no other group uses', () => {
    const w = start();
    const a = linkSuperset(w, w.exercises[1].rid);
    const b = linkSuperset({ ...a, exercises: [{ ...a.exercises[0], supersetId: 7 }, ...a.exercises.slice(1)] }, a.exercises[0].rid);
    expect(new Set(groups(b))).toEqual(new Set([groups(b)[0]]));
  });

  it('unlinking takes one exercise out, and a group of one is dissolved', () => {
    const w = start();
    const a = linkSuperset(linkSuperset(w, w.exercises[0].rid), w.exercises[1].rid);
    const b = unlinkSuperset(a, a.exercises[2].rid);
    expect(groups(b)[2]).toBeNull();
    expect(groups(b)[0]).toBe(groups(b)[1]);
    const c = unlinkSuperset(b, b.exercises[0].rid);
    expect(groups(c)).toEqual([null, null, null]);
  });

  it('no rest between the exercises of a superset, rest after the last one', () => {
    const st = start();
    const s = linkSuperset(st, st.exercises[0].rid);
    const a = confirmSet(s, s.exercises[0].rid, s.exercises[0].sets[0].rid, 5000);
    expect(a.rest).toBeNull();
    const b = confirmSet(a, a.exercises[1].rid, a.exercises[1].sets[0].rid, 6000);
    expect(b.rest).toEqual({ startMs: 6000, durationS: 90 });
  });

  it('rests normally once the later exercise of the superset is finished', () => {
    const st = start();
    const s0 = linkSuperset(st, st.exercises[0].rid);
    let s = s0;
    for (const set of s0.exercises[1].sets) s = confirmSet(s, s0.exercises[1].rid, set.rid, 4000);
    expect(confirmSet(s, s.exercises[0].rid, s.exercises[0].sets[0].rid, 5000).rest).toEqual({ startMs: 5000, durationS: 90 });
  });
});

describe('last values across Hevy and own ids', () => {
  const hevyPreacher = (title: string, endMs: number) => past(`h-${title}`, endMs, 'HEVY-TPL-1', [done(30, 10), done(30, 9)]);
  it('a swapped-in own exercise takes the last sets logged under its Hevy title', () => {
    const hist = [{ ...hevyPreacher('a', 5000), exercises: [{ exerciseId: 'HEVY-TPL-1', title: 'Preacher Curl (Barbell)', supersetId: null, notes: '', sets: [done(30, 10), done(30, 9)] }] }];
    const w = startFromPlan(plan, [], 10, 'w1');
    const preacher = { id: 'pf-preacher-curl', title: 'Scott-Curl', type: 'weight_reps', primaryMuscle: 'biceps', equipment: 'barbell', hevyTitle: 'Preacher Curl (Barbell)' };
    const s = swapExercise(w, ex0(w), preacher, hist);
    expect(s.exercises[0].sets.map((x) => [x.weightKg, x.reps])).toEqual([[30, 10], [30, 9]]);
  });

  it('also under the German Hevy title', () => {
    const hist = [{ ...hevyPreacher('b', 5000), exercises: [{ exerciseId: 'HEVY-TPL-2', title: 'Preacher Curl (Langhantel)', supersetId: null, notes: '', sets: [done(25, 12)] }] }];
    expect(lastValues('pf-preacher-curl', hist).map((x) => x.weightKg)).toEqual([25]);
  });
});

test('a title that is now an overlay alias of a built-in finds its past values', () => {
  const alias = { kind: 'exercise' as const, id: 'pf-bench-press', updatedMs: 1, deleted: false, body: { id: 'pf-bench-press', aliases: ['Flat Press Custom'] } };
  const catalog = mergeCatalog(EXERCISES, [], [alias]);
  const hist = [past('h1', 5000, 'hevy-odd-1', [done(40, 10)])];
  hist[0].exercises[0].title = 'Flat Press Custom';
  expect(lastValues('pf-bench-press', hist)).toEqual([]);
  expect(lastValues('pf-bench-press', hist, catalog).map((s) => [s.weightKg, s.reps])).toEqual([[40, 10]]);
  const w = startFromPlan(plan, hist, 10, 'w1', catalog);
  expect(w.exercises[0].sets.map((s) => [s.weightKg, s.reps])).toEqual([[50, 8], [40, 8]]);
});

describe('last values come from the current studio', () => {
  const hist = [
    past('a', 9000, 'pf-bench-press', [done(30, 10)], { studio: 'Alt' }),
    past('b', 8000, 'pf-bench-press', [done(50, 10)], { studio: 'Neu' }),
    past('c', 1000, 'pf-bench-press', [done(40, 10)], { studio: 'Alt' }),
  ];
  const step = { name: 'R', exercises: [{ templateId: 'pf-bench-press', title: 'B', restS: null, supersetId: null, notes: '', sets: [{ type: 'normal' as const, weightKg: null, reps: null }] }] };
  test('prefill and hint values are from the studio, not the newest session overall', () => {
    expect(lastValues('pf-bench-press', hist, undefined, 'Neu').map((s) => s.weightKg)).toEqual([50]);
    expect(lastValues('pf-bench-press', hist, undefined, 'Alt').map((s) => s.weightKg)).toEqual([30]);
    expect(lastValues('pf-bench-press', hist).map((s) => s.weightKg)).toEqual([30]); // default: the studio of the newest own workout
    expect(startFromPlan(step, hist, 10, 'w', undefined, 'Neu').exercises[0].sets[0].weightKg).toBe(50);
    expect(addExercise({ ...startEmpty(1, 'e'), studio: 'Neu' }, EXERCISES.find((e) => e.id === 'pf-bench-press')!, hist).exercises[0].sets[0].weightKg).toBe(50);
  });
  test('no history in this studio falls back to all studios', () => {
    expect(lastValues('pf-bench-press', hist, undefined, 'Dritte').map((s) => s.weightKg)).toEqual([30]);
  });
});

describe('renamed studios in the app', () => {
  const set = { type: 'normal' as const, weightKg: 50, reps: 8, durationS: null, doneMs: 5 };
  const past = (id: string, startMs: number, studio: string, kg: number): LoggedWorkout => ({ id, title: 'T', startMs, endMs: startMs + 1, source: 'pandafit', studio, exercises: [{ exerciseId: 'pf-squat', title: 'K', supersetId: null, notes: '', sets: [{ ...set, weightKg: kg }] }] });
  test('lastValues and hereKey follow a rename', () => {
    const history = [past('a', 10, 'Alpha', 60), past('b', 20, 'Beta', 40)];
    const studios = studioStateOf([studioRecord('Alpha', 99, 99, 'Neu'), studioRecord('Neu', 99, 99)]);
    expect(hereKey({ studio: 'Alpha' }, history, studios)).toBe('Neu');
    expect(lastValues('pf-squat', history, undefined, 'Neu', studios)[0].weightKg).toBe(60);
    expect(lastValues('pf-squat', history, undefined, 'Neu')[0].weightKg).toBe(40);
    const ladder = (renames: typeof studios.renames) => stepHere('pf-squat', 'machine', [past('a', 10, 'Alpha', 60), past('c', 15, 'Alpha', 62.5), past('b', 20, 'Beta', 40)], 'Neu', new Map(), renames);
    expect(ladder(studios.renames).stepKg).toBe(2.5);
    expect(ladder(new Map()).stepKg).not.toBe(2.5);
  });
});
