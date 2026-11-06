import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExerciseMapper, proposalId } from '../../../src/coach/gym/exercise-mapper';
import { RecordStore } from '../../../src/coach/tracking/store';
import { mergeCatalog } from '../../../src/shared/catalog';
import { EXERCISES } from '../../../src/shared/exercises';
import type { TrackedRecord } from '../../../src/shared/records';
import { resolveExercise } from '../../../src/tracking/exercise-identity';

const NOW = Date.UTC(2026, 10, 6, 12);
const DAY = 86_400_000;
const ID = 'p1';
let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mapper-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const TITLE = 'Squat (Barbell) Zorbo';
const workout = (title: string, daysAgo = 3): TrackedRecord => ({
  kind: 'workout', id: `w-${title}`, updatedMs: NOW, deleted: false,
  body: { id: `w-${title}`, title: 'Tag', startMs: NOW - daysAgo * DAY, endMs: NOW - daysAgo * DAY + 3600_000, source: 'hevy', exercises: [{ exerciseId: `hevy-${title}`, title, supersetId: null, notes: '', sets: [] }] },
});

function harness(answers: (() => unknown)[], titles = [TITLE], clock = { now: NOW }, gate = { may: true }) {
  const store = new RecordStore({ dir: path.join(tmp, 'tracking') });
  store.putMany(ID, titles.map((t) => workout(t)));
  const prompts: string[] = [];
  let n = 0;
  const mapper = new ExerciseMapper({
    store, dir: path.join(tmp, 'coach'), nowMs: () => clock.now, mayAsk: () => gate.may,
    catalog: (id) => mergeCatalog(EXERCISES, [], store.all(id, 'exercise')),
    ask: async (i) => { prompts.push(i.prompt); const f = answers[Math.min(n, answers.length - 1)]; n += 1; return f(); },
  });
  return { store, mapper, prompts, clock, gate };
}
const exRecords = (s: RecordStore) => s.all(ID, 'exercise');
const same = (confidence: 'high' | 'medium', exerciseId = 'pf-squat', title = TITLE) => ({ items: [{ title, decision: 'same', exerciseId, confidence, reason: 'Gleiche Übung.' }] });
const fresh = (title = TITLE, over: object = {}) => ({ items: [{ title, decision: 'new', name: 'Zorbo-Zug', primaryMuscle: 'lats', secondaryMuscles: ['biceps'], equipment: 'machine', type: 'weight_reps', description: 'Ruhig ziehen. Kontrolliert zurück.', reason: 'Neu.', ...over }] });

describe('ExerciseMapper', () => {
  it('high same: alias overlay written, title resolves, auto link noted', async () => {
    const h = harness([() => same('high')]);
    await h.mapper.run(ID);
    const rec = exRecords(h.store).find((r) => r.id === 'pf-squat')!;
    expect((rec.body as { aliases: string[]; lastAutoLink: unknown }).aliases).toEqual([TITLE]);
    expect((rec.body as { lastAutoLink: unknown }).lastAutoLink).toEqual({ title: TITLE, atMs: NOW });
    const cat = mergeCatalog(EXERCISES, [], exRecords(h.store));
    expect(resolveExercise({ exerciseId: 'x', title: TITLE }, cat).exercise?.id).toBe('pf-squat');
  });

  it('keeps aliases of an existing overlay', async () => {
    const h = harness([() => same('high')]);
    h.store.putMany(ID, [{ kind: 'exercise', id: 'pf-squat', updatedMs: NOW - 1000, deleted: false, body: { id: 'pf-squat', aliases: ['Old Alias'], description: 'Mein Text.' } }]);
    await h.mapper.run(ID);
    const b = exRecords(h.store).find((r) => r.id === 'pf-squat')!.body as { aliases: string[]; description: string };
    expect(b.aliases).toEqual(['Old Alias', TITLE]);
    expect(b.description).toBe('Mein Text.');
  });

  it('medium same: proposal record, no alias', async () => {
    const h = harness([() => same('medium')]);
    await h.mapper.run(ID);
    const recs = exRecords(h.store);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.id).toBe(proposalId(TITLE));
    expect((recs[0]!.body as { proposal: unknown }).proposal).toMatchObject({ forTitle: TITLE, kind: 'same', targetId: 'pf-squat', reason: 'Gleiche Übung.', atMs: NOW });
    expect(mergeCatalog(EXERCISES, [], recs).find((e) => exerciseTitlesHas(e, TITLE))).toBeUndefined();
  });

  it('new: proposal record with the exercise fields', async () => {
    const h = harness([() => fresh()]);
    await h.mapper.run(ID);
    const b = exRecords(h.store)[0]!.body as Record<string, unknown>;
    expect(b).toMatchObject({ title: 'Zorbo-Zug', primaryMuscle: 'lats', secondaryMuscles: ['biceps'], equipment: 'machine', type: 'weight_reps', source: 'ai', proposal: { kind: 'new', forTitle: TITLE } });
  });

  it('drops invalid items: unknown exerciseId, bad muscle', async () => {
    const h = harness([() => same('high', 'pf-nope')]);
    await h.mapper.run(ID);
    expect(exRecords(h.store)).toHaveLength(0);
    const h2 = harness([() => fresh(TITLE, { primaryMuscle: 'wings' })]);
    await h2.mapper.run(ID);
    expect(exRecords(h2.store)).toHaveLength(0);
  });

  it('invalid answer twice: nothing, no throw; second try carries the error', async () => {
    const h = harness([() => 'garbage']);
    await expect(h.mapper.run(ID)).resolves.toBe(false);
    expect(exRecords(h.store)).toHaveLength(0);
    expect(h.prompts).toHaveLength(2);
    expect(h.prompts[1]).toContain('ungültig');
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(2);
  });

  it('ask throws: nothing written, quietly', async () => {
    const h = harness([() => { throw new Error('no ai'); }]);
    await expect(h.mapper.run(ID)).resolves.toBe(false);
    expect(exRecords(h.store)).toHaveLength(0);
  });

  it('asks a title at most once per 24 h', async () => {
    const h = harness([() => ({ items: [] })]);
    await h.mapper.run(ID);
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
    h.clock.now += DAY + 1000;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(2);
  });

  it('does not ask for a title already proposed or known', async () => {
    const h = harness([() => same('medium')]);
    await h.mapper.run(ID);
    h.clock.now += 3 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
    const h2 = harness([() => same('high')], ['Squat (Barbell)']);
    await h2.mapper.run(ID);
    expect(h2.prompts).toHaveLength(0);
  });

  it('a title the person undid is only proposed', async () => {
    fs.mkdirSync(path.join(tmp, 'coach'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'coach', 'exercise-mapper.json'), JSON.stringify({ asked: {}, undone: [TITLE] }));
    const h = harness([() => same('high')]);
    await h.mapper.run(ID);
    const recs = exRecords(h.store);
    expect(recs.map((r) => r.id)).toEqual([proposalId(TITLE)]);
  });

  it('a title named in an overlay\'s undoneTitles is only proposed', async () => {
    const h = harness([() => same('high')]);
    h.store.putMany(ID, [{ kind: 'exercise', id: 'pf-squat', updatedMs: NOW - 1000, deleted: false, body: { id: 'pf-squat', aliases: [], undoneTitles: [TITLE] } }]);
    await h.mapper.run(ID);
    const recs = exRecords(h.store);
    expect(recs.map((r) => r.id).sort()).toEqual(['pf-squat', proposalId(TITLE)].sort());
    expect((recs.find((r) => r.id === 'pf-squat')!.body as { aliases: string[] }).aliases).toEqual([]);
    expect(mergeCatalog(EXERCISES, [], recs).find((e) => e.id === 'pf-squat')?.aliases ?? []).not.toContain(TITLE);
  });

  it('does not ask for a title whose confirmed new exercise already exists', async () => {
    const h = harness([() => fresh()]);
    h.store.putMany(ID, [{ kind: 'exercise', id: proposalId(TITLE), updatedMs: NOW - 1000, deleted: false, body: { id: proposalId(TITLE), title: 'Zorbo-Zug', primaryMuscle: 'lats', equipment: 'machine', type: 'weight_reps', source: 'ai' } }]);
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(0);
    expect(exRecords(h.store)).toHaveLength(1);
  });

  it('links one title per target, the other becomes a proposal', async () => {
    const A = 'Zorbo Squat A';
    const B = 'Zorbo Squat B';
    const h = harness([() => ({ items: [...same('high', 'pf-squat', A).items, ...same('high', 'pf-squat', B).items] })], [A, B]);
    await h.mapper.run(ID);
    const recs = exRecords(h.store);
    const overlay = recs.find((r) => r.id === 'pf-squat')!.body as { aliases: string[]; lastAutoLink: { title: string } };
    expect(overlay.aliases).toHaveLength(1);
    expect(overlay.lastAutoLink.title).toBe(overlay.aliases[0]);
    const props = recs.filter((r) => r.id !== 'pf-squat');
    expect(props).toHaveLength(1);
    expect((props[0]!.body as { proposal: { kind: string; forTitle: string } }).proposal).toMatchObject({ kind: 'same', forTitle: overlay.aliases[0] === A ? B : A });
  });

  it('a run while one is in flight returns false at once and does not queue', async () => {
    const h = harness([() => ({ items: [{ title: TITLE, decision: 'unsure', reason: 'Unklar.' }] })]);
    h.store.putMany('p2', [workout(TITLE)]);
    const [a, b] = await Promise.all([h.mapper.run(ID), h.mapper.run('p2')]);
    expect(b).toBe(false);
    expect(a).toBe(false);
    expect(h.prompts).toHaveLength(1);
  });

  it('a failing ask causes no second call within 1 h, then tries again', async () => {
    const h = harness([() => { throw new Error('offline'); }, () => ({ items: [] })]);
    await h.mapper.run(ID);
    h.clock.now += 3000_000;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
    h.clock.now += 700_000;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(2);
  });

  it('mayAsk false: no call, and nothing remembered', async () => {
    const h = harness([() => ({ items: [] })]);
    h.gate.may = false;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(0);
    h.gate.may = true;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
  });

  it('mayAsk is checked again before the retry call', async () => {
    const h = harness([() => { h.gate.may = false; return 'garbage'; }]);
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
  });

  it('nothing changed: no new scan within 24 h', async () => {
    const h = harness([() => ({ items: [] })]);
    await h.mapper.run(ID);
    h.clock.now += 3600_000;
    h.store.putMany(ID, [workout('Squat (Barbell)')]);
    const spy = h.store.all.bind(h.store);
    let reads = 0;
    h.store.all = ((...a: Parameters<typeof spy>) => { reads += 1; return spy(...a); }) as typeof h.store.all;
    await h.mapper.run(ID); // changed: scans
    const afterChange = reads;
    await h.mapper.run(ID); // unchanged: only the fingerprint reads
    expect(reads - afterChange).toBeLessThanOrEqual(2);
  });

  it('unsure titles are asked again only after 7 days', async () => {
    const h = harness([() => ({ items: [{ title: TITLE, decision: 'unsure', reason: 'Unklar.' }] })]);
    await h.mapper.run(ID);
    h.clock.now += 2 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
    h.clock.now += 6 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(2);
  });

  it('ignores titles older than 180 days and caps at 20 titles', async () => {
    const titles = Array.from({ length: 25 }, (_, i) => `Zorbo Move ${i}`);
    const h = harness([() => ({ items: [] })], titles);
    h.store.putMany(ID, [workout('Ancient Zorbo', 200)]);
    await h.mapper.run(ID);
    expect(h.prompts[0]!.match(/Titel:/g)).toHaveLength(20);
    expect(h.prompts[0]).not.toContain('Ancient');
  });
});

import { exerciseTitles } from '../../../src/shared/exercises';
const exerciseTitlesHas = (e: Parameters<typeof exerciseTitles>[0], t: string) => exerciseTitles(e).includes(t);
