import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MUSCLE_TARGETS, muscleGroupOf, weeklySetRange } from '../../src/shared/muscle-targets';
import { MUSCLES } from '../../src/shared/muscles';
import { policyRule } from '../../src/shared/training-policy';

describe('muscle groups', () => {
  const SKIP = new Set(['full_body', 'cardio', 'other']);
  it('maps every muscle of the vocabulary to a real group', () => {
    for (const m of Object.keys(MUSCLES).filter((k) => !SKIP.has(k))) {
      const g = muscleGroupOf({ primaryMuscle: m });
      expect(g, m).not.toBe('other');
      expect(Object.keys(MUSCLE_TARGETS)).toContain(g);
    }
    for (const m of SKIP) expect(muscleGroupOf({ primaryMuscle: m })).toBe('other');
  });
  it('counts abductors as glutes and adductors as quads', () => {
    expect(muscleGroupOf({ primaryMuscle: 'abductors' })).toBe('glutes');
    expect(muscleGroupOf({ primaryMuscle: 'adductors' })).toBe('quads');
  });
  it('takes the targets from the register, with the new values', () => {
    for (const [g, t] of Object.entries(MUSCLE_TARGETS)) {
      if (g === 'other') continue;
      expect(policyRule(`muscle.target.${g}`).value).toEqual(t.muscle);
    }
    expect(MUSCLE_TARGETS.hamstrings).toMatchObject({ muscle: { min: 10, max: 16 }, other: { min: 4, max: 6 }, reps: { min: 6, max: 12 } });
    expect(MUSCLE_TARGETS.glutes).toMatchObject({ muscle: { min: 6, max: 12 }, other: { min: 0, max: 4 }, reps: { min: 8, max: 15 } });
    expect(MUSCLE_TARGETS.front_delts).toMatchObject({ muscle: { min: 6, max: 10 }, other: { min: 2, max: 4 } });
    expect(MUSCLE_TARGETS.side_delts).toMatchObject({ muscle: { min: 12, max: 20 }, other: { min: 6, max: 8 }, reps: { min: 12, max: 25 } });
    expect(MUSCLE_TARGETS.rear_delts).toMatchObject({ muscle: { min: 8, max: 16 }, other: { min: 4, max: 6 }, reps: { min: 12, max: 25 } });
    expect(weeklySetRange('glutes', 'muscle')).toEqual({ min: 6, max: 12 });
    expect(weeklySetRange('other', 'muscle')).toEqual({ min: 0, max: 0 });
  });
  it('keeps no regex and no id list in muscle-targets.ts', () => {
    const src = readFileSync('src/shared/muscle-targets.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/new RegExp|=\s*\/.+\/[gimsuy]*[;.]|\.test\(|'pf-/);
  });
});
