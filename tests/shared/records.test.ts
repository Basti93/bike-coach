import { describe, it, expect } from 'vitest';
import { applyRecord, type TrackedRecord } from '../../src/shared/records';
import { EXERCISES, linkHevyTemplates } from '../../src/shared/exercises';

const rec = (updatedMs: number, body: unknown = { a: 1 }, deleted = false): TrackedRecord => ({ kind: 'workout', id: 'w1', updatedMs, deleted, body });

describe('applyRecord', () => {
  it('the newer record wins and returns the overwritten one', () => {
    const a = rec(1), b = rec(2, { a: 2 });
    expect(applyRecord(a, b)).toEqual({ keep: b, overwritten: a });
  });
  it('the same record twice changes nothing', () => {
    const a = rec(1);
    expect(applyRecord(a, { ...a })).toEqual({ keep: a, overwritten: null });
    expect(applyRecord(undefined, a)).toEqual({ keep: a, overwritten: null });
  });
  it('an older record never replaces a newer one', () => {
    const a = rec(5), old = rec(2, { a: 9 });
    expect(applyRecord(a, old)).toEqual({ keep: a, overwritten: old });
  });
  it('a tie ends the same in either order', () => {
    const a = rec(3, { a: 1 }), b = rec(3, { a: 2 });
    expect(applyRecord(a, b).keep).toEqual(applyRecord(b, a).keep);
  });
  it('a deleted record stays as a tombstone', () => {
    const a = rec(1), gone = rec(2, null, true);
    const r = applyRecord(a, gone);
    expect(r.keep.deleted).toBe(true);
    expect(r.keep.id).toBe('w1');
    expect(applyRecord(r.keep, a).keep.deleted).toBe(true);
  });
});

describe('EXERCISES', () => {
  it('exercise ids are unique and each has a known type, muscle and equipment', () => {
    const types = ['weight_reps', 'reps_only', 'bodyweight_weighted', 'bodyweight_assisted', 'duration', 'distance_duration', 'short_distance_weight', 'floors_duration', 'steps_duration'];
    expect(EXERCISES.length).toBeGreaterThanOrEqual(90);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.id).toMatch(/^pf-/);
      expect(types).toContain(e.type);
      expect(e.title).not.toBe('');
      expect(e.primaryMuscle).not.toBe('');
      expect(e.equipment).not.toBe('');
    }
  });
  it('each hevyTitle appears on one exercise only', () => {
    const titles = EXERCISES.map((e) => e.hevyTitle).filter((t): t is string => !!t);
    expect(titles.length).toBeGreaterThan(30);
    expect(new Set(titles).size).toBe(titles.length);
  });
  it('linkHevyTemplates links by exact title and ignores unknown ones', () => {
    const squat = EXERCISES.find((e) => e.id === 'pf-squat')!;
    const map = linkHevyTemplates([
      { id: 'H1', title: squat.hevyTitle! }, { id: 'H2', title: squat.hevyTitle!.toLowerCase() }, { id: 'H3', title: 'Nonsense Move' },
    ]);
    expect(map.get('pf-squat')).toBe('H1');
    expect(map.size).toBe(1);
  });
});
