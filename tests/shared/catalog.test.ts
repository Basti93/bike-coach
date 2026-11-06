import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/shared/catalog';
import { linkRecord } from '../../src/shared/exercise-links';
import { EXERCISES, type Exercise } from '../../src/shared/exercises';
import type { TrackedRecord } from '../../src/shared/records';
import { resolveExercise } from '../../src/tracking/exercise-identity';
import { describeExercise } from '../../src/tracking/similar';

const rec = (id: string, body: unknown, deleted = false): TrackedRecord => ({ kind: 'exercise', id, updatedMs: 1, deleted, body });
const own = { id: 'u-1', title: 'Mein Zug', primaryMuscle: 'lats', equipment: 'machine', type: 'weight_reps' };

describe('mergeCatalog', () => {
  it('keeps built-ins first, then base, then own', () => {
    const base: Exercise[] = [{ id: 'fedb-1', title: 'Base', type: 'weight_reps', primaryMuscle: 'chest', equipment: 'other' }];
    const m = mergeCatalog(EXERCISES, base, [rec('u-1', own)]);
    expect(m.slice(0, EXERCISES.length)).toEqual(EXERCISES);
    expect(m[EXERCISES.length].id).toBe('fedb-1');
    expect(m[m.length - 1]).toMatchObject({ id: 'u-1', title: 'Mein Zug' });
  });

  it('an overlay adds an alias to a built-in and the title resolves', () => {
    const m = mergeCatalog(EXERCISES, [], [rec('pf-cable-curl', { id: 'pf-cable-curl', aliases: ['My Cable Curl'] })]);
    expect(resolveExercise({ exerciseId: 'h', title: 'My Cable Curl' }, m).exercise?.id).toBe('pf-cable-curl');
    expect(m.length).toBe(EXERCISES.length);
  });

  it('merges aliases without duplicates and keeps order', () => {
    const b: Exercise[] = [{ id: 'a', title: 'A', type: 't', primaryMuscle: 'chest', equipment: 'e', aliases: ['x', 'y'] }];
    const m = mergeCatalog(b, [], [rec('a', { id: 'a', aliases: ['y', 'z'] })]);
    expect(m[0].aliases).toEqual(['x', 'y', 'z']);
  });

  it('an overlay cannot change the muscle of a built-in; description is the record\'s', () => {
    const m = mergeCatalog(EXERCISES, [], [rec('pf-cable-curl', { id: 'pf-cable-curl', primaryMuscle: 'calves', title: 'X', description: 'Eigener Text' })]);
    const e = m.find((x) => x.id === 'pf-cable-curl')!;
    expect(e.primaryMuscle).toBe(EXERCISES.find((x) => x.id === 'pf-cable-curl')!.primaryMuscle);
    expect(e.title).toBe(EXERCISES.find((x) => x.id === 'pf-cable-curl')!.title);
    expect(e.description).toBe('Eigener Text');
    expect(describeExercise({ exerciseId: 'pf-cable-curl', title: e.title }, m)).toEqual({ text: 'Eigener Text', source: { kind: 'own' } });
  });

  it('ignores deleted, proposal and malformed records', () => {
    const m = mergeCatalog(EXERCISES, [], [
      rec('d', { ...own, id: 'd' }, true),
      rec('p', { ...own, id: 'p', proposal: { forTitle: 'T', kind: 'new', reason: 'r', atMs: 1 } }),
      rec('bad', { id: 'bad', primaryMuscle: 'chest', equipment: 'e', type: 't' }),
      rec('nul', null),
    ]);
    expect(m.length).toBe(EXERCISES.length);
  });

  it('builds own exercises from validated fields only', () => {
    const m = mergeCatalog([], [], [rec('u-1', { ...own, aliases: ['ok', 3, null], secondaryMuscles: ['biceps', 'nonsense', 7], junk: 1 })]);
    expect(m).toEqual([{ ...own, aliases: ['ok'], secondaryMuscles: ['biceps'] }]);
  });

  it('keeps the secondary muscles the mapper and the base list use', () => {
    const m = mergeCatalog([], [], [rec('u-2', { ...own, id: 'u-2', secondaryMuscles: ['lats', 'quadriceps', 'glutes', 'abdominals', 'shoulders', 'back'] })]);
    expect(m[0]!.secondaryMuscles).toEqual(['lats', 'quadriceps', 'glutes', 'abdominals', 'shoulders']);
  });

  it('a live link record adds its title as an alias of its target and is no entry itself', () => {
    const link = linkRecord('My Cable Curl', 'pf-cable-curl', 'auto', 5);
    const m = mergeCatalog(EXERCISES, [], [link]);
    expect(m.length).toBe(EXERCISES.length);
    expect(resolveExercise({ exerciseId: 'h', title: 'My Cable Curl' }, m).exercise?.id).toBe('pf-cable-curl');
    expect(mergeCatalog(EXERCISES, [], [{ ...link, deleted: true }]).find((e) => e.id === 'pf-cable-curl')?.aliases ?? []).not.toContain('My Cable Curl');
  });

  it('a link to a missing target does nothing; a link to an own exercise works whatever the record order', () => {
    expect(mergeCatalog(EXERCISES, [], [linkRecord('Zorbo', 'nope', 'auto', 5)]).length).toBe(EXERCISES.length);
    const m = mergeCatalog([], [], [linkRecord('Zorbo', 'u-1', 'person', 5), rec('u-1', own)]);
    expect(m).toHaveLength(1);
    expect(m[0]!.aliases).toEqual(['Zorbo']);
  });
});
