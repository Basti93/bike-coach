import { createWorkoutStore } from '../../src/tracking/store';
import { confirmSet, startFromPlan, startEmpty, editSet, type TrackedWorkout } from '../../src/tracking/session';
import type { LoggedWorkout, TrackedRecord } from '../../src/shared/records';
import type { GymWorkout } from '../../src/coach/gym/types';
import { fakePort } from './fake-port';

const plan: GymWorkout = { name: 'P', exercises: [{ templateId: 'pf-squat', title: 'Kniebeuge', restS: null, supersetId: null, notes: '', sets: [
  { type: 'normal', weightKg: null, reps: null }, { type: 'normal', weightKg: null, reps: null }] }] };
const fresh = () => startFromPlan(plan, [], 10, 'w1');
const ids = (w: TrackedWorkout) => ({ e: w.exercises[0].rid, s0: w.exercises[0].sets[0].rid, s1: w.exercises[0].sets[1].rid });
const stored = (m: Map<string, TrackedRecord>) => m.get('workout:w1')!;
const body = (m: Map<string, TrackedRecord>) => stored(m).body as LoggedWorkout;

afterEach(() => { vi.useRealTimers(); });

describe('monotonic updatedMs', () => {
  test('a clock that steps back still lets the newest edit win', async () => {
    const { port, map } = fakePort();
    const times = [5000, 4000, 3000];
    const w = fresh(); const { e, s0, s1 } = ids(w);
    const store = createWorkoutStore(port, w, () => times.shift() ?? 1000);
    await store.apply((x) => confirmSet(x, e, s0, 1));
    await store.apply((x) => confirmSet(x, e, s1, 2));
    expect(body(map).exercises[0].sets.map((s) => s.doneMs)).toEqual([1, 2]);
    expect(stored(map).updatedMs).toBeGreaterThan(5000);
  });
  test('writes in the same millisecond are ordered', async () => {
    const { port, map, state } = fakePort();
    const w = fresh(); const { e, s0, s1 } = ids(w);
    const store = createWorkoutStore(port, w, () => 1000);
    await store.apply((x) => confirmSet(x, e, s0, 1));
    await store.apply((x) => confirmSet(x, e, s1, 2));
    const [a, b] = state.puts.map((p) => p.updatedMs);
    expect(b).toBeGreaterThan(a);
    expect(body(map).exercises[0].sets[1].doneMs).toBe(2);
  });
  test('a record whose updatedMs lies ahead of this clock is still overtaken', async () => {
    const w = fresh(); const { e, s0 } = ids(w);
    const { port, map } = fakePort([{ kind: 'workout', id: 'w1', updatedMs: 9_000_000, deleted: false, body: w }]);
    const store = createWorkoutStore(port, { kind: 'workout', id: 'w1', updatedMs: 9_000_000, deleted: false, body: w }, () => 1000);
    await store.apply((x) => confirmSet(x, e, s0, 1));
    expect(stored(map).updatedMs).toBe(9_000_001);
    expect(body(map).exercises[0].sets[0].doneMs).toBe(1);
  });
});

describe('finish decides on the serial chain against current', () => {
  test('finish during a pending put keeps the edit', async () => {
    const { port, map, state } = fakePort();
    const w = fresh(); const { e, s0, s1 } = ids(w);
    const store = createWorkoutStore(port, w, () => 100);
    await store.apply((x) => x);
    let release!: () => void; state.gate = new Promise<void>((r) => { release = r; });
    void store.apply((x) => confirmSet(x, e, s0, 5)); // pending
    const fin = store.finish('omit'); // shown snapshot still has no confirmed set
    state.gate = null; release();
    const r = await fin;
    expect(r.status).toBe('finished');
    expect(body(map).exercises[0].sets.map((s) => s.doneMs)).toEqual([5, null]);
    expect(body(map).endMs).not.toBeNull();
    expect(s1).toBeTruthy();
  });
  test('weglassen right after a confirm keeps the set', async () => {
    const { port, map } = fakePort();
    const w = fresh(); const { e, s0 } = ids(w);
    const store = createWorkoutStore(port, w, () => 100);
    void store.apply((x) => confirmSet(x, e, s0, 7));
    await store.finish('omit');
    expect(body(map).exercises[0].sets[0].doneMs).toBe(7);
  });
  test('verwerfen with a pending confirm does not tombstone', async () => {
    const { port, map } = fakePort();
    const w = fresh(); const { e, s0 } = ids(w);
    const store = createWorkoutStore(port, w, () => 100);
    void store.apply((x) => confirmSet(x, e, s0, 7));
    const r = await store.finish('discard');
    expect(r.status).not.toBe('discard');
    expect(map.get('workout:w1')!.deleted).toBe(false);
    expect(body(map).exercises[0].sets[0].doneMs).toBe(7);
  });
  test('discard with nothing confirmed writes a tombstone', async () => {
    const { port, map } = fakePort();
    const store = createWorkoutStore(port, fresh(), () => 100);
    const r = await store.finish('discard');
    expect(r).toMatchObject({ status: 'discard', saved: true });
    expect(map.get('workout:w1')!.deleted).toBe(true);
  });
});

describe('failing puts', () => {
  test('a put that does not answer in 10 s counts as failed and keeps the state', async () => {
    vi.useFakeTimers();
    const { port, state } = fakePort();
    const w = fresh(); const { e, s0 } = ids(w);
    const store = createWorkoutStore(port, w, () => 100);
    state.hang = true;
    const job = store.apply((x) => confirmSet(x, e, s0, 5));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await job).toBe(false);
    expect(store.view().save).toBe('unsaved');
    expect(store.view().workout.exercises[0].sets[0].doneMs).toBe(5);
    store.dispose();
  });
  test('an unsaved state retries by itself every 15 s', async () => {
    vi.useFakeTimers();
    const { port, map, state } = fakePort();
    const w = fresh(); const { e, s0 } = ids(w);
    const store = createWorkoutStore(port, w, () => 100);
    state.failPuts = true;
    expect(await store.apply((x) => confirmSet(x, e, s0, 5))).toBe(false);
    state.failPuts = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.view().save).toBe('saved');
    expect(body(map).exercises[0].sets[0].doneMs).toBe(5);
    store.dispose();
  });
});

test('reload replaces the state with a newer copy and raises the clock floor', async () => {
  const { port, map } = fakePort();
  const w = fresh(); const { e, s0 } = ids(w);
  const store = createWorkoutStore(port, w, () => 100);
  await store.apply((x) => x);
  const remote = confirmSet(w, e, s0, 9);
  store.reload({ kind: 'workout', id: 'w1', updatedMs: 50_000, deleted: false, body: remote });
  expect(store.view().workout.exercises[0].sets[0].doneMs).toBe(9);
  expect(store.updatedMs()).toBe(50_000);
  await store.apply((x) => editSet(x, e, s0, { reps: 3 }));
  expect(stored(map).updatedMs).toBe(50_001);
});

test('remove writes a tombstone', async () => {
  const { port, map } = fakePort();
  const store = createWorkoutStore(port, startEmpty(1, 'w1', 'Frei'), () => 3);
  expect(await store.remove()).toBe(true);
  expect(map.get('workout:w1')!.deleted).toBe(true);
});
