import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../src/shared/catalog';
import { EXERCISES, exerciseTitles } from '../../src/shared/exercises';
import { descriptionCredit, descriptionOf, exerciseDescription } from '../../src/shared/exercise-descriptions';
import { FEDB_EXERCISES } from '../../src/shared/fedb';
import { similarExercises } from '../../src/tracking/similar';
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
  it('ships no English instruction text', () => {
    for (const e of FEDB_EXERCISES) expect('instructionsEn' in e, e.id).toBe(false);
  });
});

describe('German guides for the base entries', () => {
  it('gives nearly every base entry a German description', () => {
    const withText = FEDB_EXERCISES.filter((e) => e.description);
    expect(withText.length).toBeGreaterThan(600);
    for (const e of withText) expect((e.description ?? '').trim().length, e.id).toBeGreaterThan(20);
  });
  it('reports the fedb source for a base entry and credits it quietly', () => {
    const e = FEDB_EXERCISES.find((x) => x.description)!;
    const d = descriptionOf(e)!;
    expect(d.source.kind).toBe('fedb');
    expect(d.text).toBe(e.description);
    expect(descriptionCredit(d)).toBe('Quelle: free-exercise-db (gemeinfrei), übersetzt');
  });
  it('lets a built-in keep its own text', () => {
    const linked = EXERCISES.find((e) => e.fedbId)!;
    const d = descriptionOf(linked);
    expect(d?.source.kind).not.toBe('fedb');
    expect(d?.text).toBe(exerciseDescription(linked.id)?.text ?? linked.description);
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

describe('swap ranking with the base catalog', () => {
  it('ranks built-ins and done exercises before base entries', async () => {
    const { similarExercises } = await import('../../src/tracking/similar');
    const cat = mergeCatalog(EXERCISES, FEDB_EXERCISES, []);
    const got = similarExercises({ title: 'Bankdrücken', exerciseId: 'pf-bench-press' }, cat).slice(0, 6);
    expect(got.every((e) => e.source !== 'fedb')).toBe(true);
    const base = cat.find((e) => e.source === 'fedb' && e.primaryMuscle === 'chest')!;
    const withDone = similarExercises({ title: 'Bankdrücken', exerciseId: 'pf-bench-press' }, cat, new Set([base.id]));
    expect(withDone[0]!.id).toBe(base.id);
  });
  it('types a base entry without equipment as bodyweight', () => {
    expect(FEDB_EXERCISES.find((e) => e.id === 'fedb-decline-push-up')).toMatchObject({ equipment: 'none', type: 'reps_only' });
  });
  it('credits an overlay description on a base entry as own text', () => {
    const e = FEDB_EXERCISES.find((x) => x.description)!;
    const rec = { kind: 'exercise', id: e.id, updatedMs: 1, deleted: false, body: { id: e.id, description: 'Mein eigener Text' } } as never;
    const merged = mergeCatalog(EXERCISES, FEDB_EXERCISES, [rec]).find((x) => x.id === e.id)!;
    expect(descriptionOf(merged)).toEqual({ text: 'Mein eigener Text', source: { kind: 'own' } });
  });
  it('ranks swaps by secondary-muscle overlap, not equipment', () => {
    const mk = (id: string, equipment: string, secondaryMuscles?: string[]) => ({ id, title: id, primaryMuscle: 'chest', equipment, type: 'weight_reps', secondaryMuscles }) as never;
    const cur = mk('cur', 'machine', ['triceps', 'shoulders']);
    const cat = [cur, mk('a-machine', 'machine'), mk('b-barbell', 'barbell', ['triceps']), mk('c-dumbbell', 'dumbbell', ['triceps', 'shoulders'])];
    const got = similarExercises({ title: 'cur', exerciseId: 'cur' }, cat).map((e) => e.id);
    expect(got).toEqual(['c-dumbbell', 'b-barbell', 'a-machine']);
  });
});
