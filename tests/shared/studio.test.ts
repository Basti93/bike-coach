import { defaultStudio, knownStudios, mainStudio, resolveStudio, studioKey, studioName, studioRecord, studioStateOf } from '../../src/shared/studio';
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

describe('studio records and renames', () => {
  const recs = (...r: ReturnType<typeof studioRecord>[]) => studioStateOf(r);
  test('a remembered studio is known without any workout, newest first, once ignoring case', () => {
    const st = recs(studioRecord('Alpha', 10, 10), studioRecord('Beta', 30, 30), studioRecord('ALPHA', 20, 20));
    expect(knownStudios([], st.renames, st.picks)).toEqual(['Beta', 'ALPHA']);
  });
  test('a forgotten studio (tombstone) is not remembered, workouts still name it', () => {
    const st = studioStateOf([{ ...studioRecord('Alpha', 10, 10), deleted: true }]);
    expect(knownStudios([], st.renames, st.picks)).toEqual([]);
    expect(knownStudios([w('a', 5, 'Alpha')], st.renames, st.picks)).toEqual(['Alpha']);
  });
  test('the default is the newest of the newest own workout and the newest pick', () => {
    const all = [w('a', 100, 'Alpha')];
    expect(defaultStudio(all, new Map(), [{ name: 'Beta', atMs: 200 }])).toBe('Beta');
    expect(defaultStudio(all, new Map(), [{ name: 'Beta', atMs: 50 }])).toBe('Alpha');
    expect(defaultStudio([], new Map(), [{ name: 'Beta', atMs: 50 }])).toBe('Beta');
  });
  test('a rename keeps history: old workouts count for the new name', () => {
    const st = recs(studioRecord('Alpha', 300, 300, 'Gamma'), studioRecord('Gamma', 300, 300));
    const all = [w('a', 10, 'Alpha'), w('b', 20, 'Gamma'), w('c', 30)];
    const main = mainStudio(all, st.renames);
    expect(main).toBe('Gamma');
    expect(all.map((x) => studioKey(x, main, st.renames))).toEqual(['Gamma', 'Gamma', 'Gamma']);
    expect(knownStudios(all, st.renames, st.picks)).toEqual(['Gamma']);
    expect(defaultStudio([w('a', 10, 'Alpha')], st.renames, st.picks)).toBe('Gamma');
  });
  test('renaming onto an existing name merges, ignoring case', () => {
    const st = recs(studioRecord('Alpha', 300, 300, 'beta'));
    expect(resolveStudio('ALPHA', st.renames)).toBe('beta');
    expect(knownStudios([w('a', 10, 'Alpha'), w('b', 20, 'Beta')], st.renames, st.picks)).toEqual(['Beta']);
  });
  test('chains are followed and a cycle ends at one name on every side', () => {
    expect(resolveStudio('A', new Map([['a', 'B'], ['b', 'C']]))).toBe('C');
    const cyc = new Map([['a', 'B'], ['b', 'A']]);
    expect(resolveStudio('A', cyc)).toBe(resolveStudio('B', cyc));
    expect(resolveStudio('A', new Map([['a', 'a']]))).toBe('A');
  });
});
