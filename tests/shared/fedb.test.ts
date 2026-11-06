import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/shared/catalog';
import { EXERCISES, exerciseTitles } from '../../src/shared/exercises';
import { FEDB_EXERCISES } from '../../src/shared/fedb';
import { EQUIPMENT, MUSCLES } from '../../src/tracking/ui/labels';

describe('base catalog (free-exercise-db)', () => {
  it('has a German title, a valid muscle, equipment and type for every entry', () => {
    expect(FEDB_EXERCISES.length).toBeGreaterThan(500);
    for (const e of FEDB_EXERCISES) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(Object.keys(MUSCLES), e.id).toContain(e.primaryMuscle);
      expect(Object.keys(EQUIPMENT), e.id).toContain(e.equipment);
      expect(e.type, e.id).toBe(e.equipment === 'none' ? 'reps_only' : 'weight_reps');
      expect(e.source).toBe('fedb');
      for (const m of e.secondaryMuscles ?? []) expect(Object.keys(MUSCLES)).toContain(m);
      expect(e.secondaryMuscles ?? []).not.toContain(e.primaryMuscle);
      expect(e.description).toBeUndefined();
    }
  });
  it('has unique ids and titles, none equal to a built-in title or alias', () => {
    expect(new Set(FEDB_EXERCISES.map((e) => e.id)).size).toBe(FEDB_EXERCISES.length);
    expect(new Set(FEDB_EXERCISES.map((e) => e.title.toLowerCase())).size).toBe(FEDB_EXERCISES.length);
    const builtIn = new Set(EXERCISES.flatMap(exerciseTitles).map((s) => s.toLowerCase()));
    for (const e of FEDB_EXERCISES) for (const t of exerciseTitles(e)) expect(builtIn.has(t.toLowerCase()), `${e.id}: ${t}`).toBe(false);
  });
  it('leaves out base entries a built-in names as its equivalent', () => {
    const linked = EXERCISES.filter((e) => e.fedbId);
    expect(linked.length).toBeGreaterThan(0);
    const merged = mergeCatalog(EXERCISES, FEDB_EXERCISES, []);
    for (const e of linked) {
      expect(merged.some((m) => m.id === e.fedbId), e.id).toBe(false);
      expect(FEDB_EXERCISES.some((m) => m.id === e.fedbId), e.id).toBe(false);
    }
    expect(merged.length).toBeGreaterThan(500);
    expect(new Set(merged.map((e) => e.id)).size).toBe(merged.length);
  });
  it('keeps the English instructions as source only', () => {
    const withText = FEDB_EXERCISES.filter((e) => (e.instructionsEn ?? []).length > 0);
    expect(withText.length).toBeGreaterThan(400);
  });
});

describe('search over the base catalog', () => {
  it('finds a base entry by its English name', async () => {
    const { matchesSearch } = await import('../../src/tracking/similar');
    const e = FEDB_EXERCISES.find((x) => x.id === 'fedb-zottman-curl')!;
    expect(matchesSearch(e, 'zottman')).toBe(true);
    expect(matchesSearch(e, 'Zottman Curl')).toBe(true);
  });
});
