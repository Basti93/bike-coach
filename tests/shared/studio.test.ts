import { defaultStudio, knownStudios, mainStudio, studioKey, studioName } from '../../src/shared/studio';
import { hevyRecord } from '../../src/coach/tracking/hevy-import';
import { createWorkoutStore } from '../../src/tracking/store';
import { setStudio, startEmpty } from '../../src/tracking/session';
import { applyRecord, type LoggedWorkout, type TrackedRecord } from '../../src/shared/records';
import { fakePort } from '../tracking/fake-port';

const w = (id: string, startMs: number, studio?: string, source: 'pandafit' | 'hevy' = 'pandafit'): LoggedWorkout =>
  ({ id, title: 'T', startMs, endMs: startMs + 1000, source, exercises: [], ...(studio ? { studio } : {}) });

describe('main studio', () => {
  test('is the studio of the earliest workout that has one', () => {
    expect(mainStudio([w('c', 30, 'Beta'), w('a', 10), w('b', 20, 'Alpha')])).toBe('Alpha');
    expect(mainStudio([w('a', 10)])).toBeUndefined();
  });
  test('old workouts without a studio count for the main studio', () => {
    const all = [w('a', 10), w('b', 20, 'Alpha'), w('c', 30, 'Beta')];
    const main = mainStudio(all);
    expect(all.map((x) => studioKey(x, main))).toEqual(['Alpha', 'Alpha', 'Beta']);
  });
  test('while no workout has a studio, everything is one bucket', () => {
    const all = [w('a', 10), w('b', 20)];
    expect(new Set(all.map((x) => studioKey(x, mainStudio(all)))).size).toBe(1);
  });
  test('a Hevy workout gets the main studio key', () => {
    const hevy = w('h', 5, undefined, 'hevy');
    expect(studioKey(hevy, mainStudio([hevy, w('b', 20, 'Alpha')]))).toBe('Alpha');
    const rec = hevyRecord({ id: 'h', title: 'H', startMs: 5, durationS: 60, exercises: [] });
    expect(studioKey(rec.body as LoggedWorkout, 'Alpha')).toBe('Alpha');
  });
});

describe('picker', () => {
  test('the default is the newest own workout\'s studio', () => {
    expect(defaultStudio([w('a', 10, 'Alpha'), w('b', 20, 'Beta'), w('h', 30, undefined, 'hevy')])).toBe('Beta');
  });
  test('an own workout without a studio counts for the main studio', () => {
    expect(defaultStudio([w('a', 10, 'Alpha'), w('b', 20)])).toBe('Alpha');
  });
  test('no studio known: no default', () => { expect(defaultStudio([w('a', 10)])).toBeUndefined(); expect(defaultStudio([])).toBeUndefined(); });
  test('known names are unique, newest first', () => {
    expect(knownStudios([w('a', 10, 'Alpha'), w('b', 20, 'Beta'), w('c', 30, 'Alpha')])).toEqual(['Alpha', 'Beta']);
  });
  test('a name is trimmed and cut at 40 characters; empty is none', () => {
    expect(studioName('  Alpha  ')).toBe('Alpha');
    expect(studioName('x'.repeat(50))).toHaveLength(40);
    expect(studioName('   ')).toBeUndefined();
  });
});

describe('studio on a workout', () => {
  test('set during a workout it is saved and synced like any field', async () => {
    const { port, map } = fakePort();
    const store = createWorkoutStore(port, startEmpty(10, 'w1'), () => 100);
    await store.apply((x) => setStudio(x, '  Alpha '));
    const rec = map.get('workout:w1')!;
    expect((rec.body as LoggedWorkout).studio).toBe('Alpha');
    // another device's copy: the newer record wins whole, studio included
    const older: TrackedRecord = { ...rec, updatedMs: rec.updatedMs - 1, body: { ...(rec.body as object), studio: undefined } };
    expect(applyRecord(older, rec).keep).toBe(rec);
    expect(JSON.parse(JSON.stringify(applyRecord(rec, older).keep)).body.studio).toBe('Alpha');
  });
  test('an empty name removes the studio', () => {
    expect(setStudio(setStudio(startEmpty(1, 'a'), 'Alpha'), ' ').studio).toBeUndefined();
  });
});

describe('main studio tie', () => {
  test('equal starts are broken by id, in any order', () => {
    expect(mainStudio([w('b', 10, 'Beta'), w('a', 10, 'Alpha')])).toBe('Alpha');
    expect(mainStudio([w('a', 10, 'Alpha'), w('b', 10, 'Beta')])).toBe('Alpha');
  });
});
