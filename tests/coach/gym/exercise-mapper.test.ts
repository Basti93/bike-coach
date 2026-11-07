import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExerciseMapper } from '../../../src/coach/gym/exercise-mapper';
import { RecordStore } from '../../../src/coach/tracking/store';
import { linkId, linkOf, proposalId, tombstone } from '../../../src/shared/exercise-links';
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
  it('high same: a link record by auto, the title resolves', async () => {
    const h = harness([() => same('high')]);
    await h.mapper.run(ID);
    const recs = exRecords(h.store);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ id: linkId(TITLE), deleted: false, body: { kind: 'link', title: TITLE, targetId: 'pf-squat', by: 'auto', atMs: NOW } });
    const cat = mergeCatalog(EXERCISES, [], recs);
    expect(resolveExercise({ exerciseId: 'x', title: TITLE }, cat).exercise?.id).toBe('pf-squat');
  });

  it('writes no alias into an existing overlay', async () => {
    const h = harness([() => same('high')]);
    const overlay: TrackedRecord = { kind: 'exercise', id: 'pf-squat', updatedMs: NOW - 1000, deleted: false, body: { id: 'pf-squat', aliases: ['Old Alias'], description: 'Mein Text.' } };
    h.store.putMany(ID, [overlay]);
    await h.mapper.run(ID);
    expect(exRecords(h.store).find((r) => r.id === 'pf-squat')).toEqual(overlay);
  });

  it('medium same: proposal record, no alias', async () => {
    const h = harness([() => same('medium')]);
    await h.mapper.run(ID);
    const recs = exRecords(h.store);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.id).toBe(proposalId(TITLE, NOW));
    expect((recs[0]!.body as { proposal: unknown }).proposal).toMatchObject({ forTitle: TITLE, kind: 'same', targetId: 'pf-squat', reason: 'Gleiche Übung.', atMs: NOW });
    expect(mergeCatalog(EXERCISES, [], recs).find((e) => exerciseTitlesHas(e, TITLE))).toBeUndefined();
  });

  it('new: proposal record with the exercise fields', async () => {
    const h = harness([() => fresh()]);
    await h.mapper.run(ID);
    const b = exRecords(h.store)[0]!.body as Record<string, unknown>;
    expect(b).toMatchObject({ title: 'Zorbo-Zug', primaryMuscle: 'lats', secondaryMuscles: ['biceps'], equipment: 'machine', type: 'weight_reps', source: 'ai', proposal: { kind: 'new', forTitle: TITLE } });
  });

  it('new: keeps a known movement family', async () => {
    const h = harness([() => fresh(TITLE, { family: 'pulldown' })]);
    await h.mapper.run(ID);
    expect(exRecords(h.store)[0]!.body).toMatchObject({ family: 'pulldown' });
  });

  it('new: drops an unknown movement family', async () => {
    const h = harness([() => fresh(TITLE, { family: 'zzz' })]);
    await h.mapper.run(ID);
    expect(exRecords(h.store)).toHaveLength(1);
    expect(exRecords(h.store)[0]!.body).not.toHaveProperty('family');
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

  it('link, then undo: the mapper proposes the title, never links it again', async () => {
    const h = harness([() => same('high')]);
    await h.mapper.run(ID);
    const [link] = exRecords(h.store);
    h.store.putMany(ID, [tombstone(link!, NOW + 1000)]);
    h.clock.now += 2 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(2);
    const recs = exRecords(h.store);
    expect(recs.find((r) => r.id === linkId(TITLE))!.deleted).toBe(true);
    const prop = recs.filter((r) => r.id.startsWith('prop-'));
    expect(prop).toHaveLength(1);
    expect(prop[0]!.body).toMatchObject({ proposal: { forTitle: TITLE, kind: 'same', targetId: 'pf-squat' } });
    expect(mergeCatalog(EXERCISES, [], recs).find((e) => e.id === 'pf-squat')?.aliases ?? []).not.toContain(TITLE);
  });

  it('a live proposal is not asked or written again, even a day later', async () => {
    const h = harness([() => same('medium')]);
    await h.mapper.run(ID);
    h.clock.now += 2 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
    expect(exRecords(h.store)).toHaveLength(1);
  });

  it('a rejected proposal is not made again for 30 days', async () => {
    const h = harness([() => same('medium')]);
    await h.mapper.run(ID);
    const [prop] = exRecords(h.store);
    h.store.putMany(ID, [tombstone(prop!, NOW + 1000)]);
    h.clock.now += 20 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
    h.clock.now += 11 * DAY;
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(2);
  });

  it('a confirmed new exercise (own id, link) is known and not asked again', async () => {
    const h = harness([() => fresh()]);
    h.store.putMany(ID, [
      { kind: 'exercise', id: 'ai-1', updatedMs: NOW - 1000, deleted: false, body: { id: 'ai-1', title: 'Zorbo-Zug', primaryMuscle: 'lats', equipment: 'machine', type: 'weight_reps', source: 'ai' } },
      { kind: 'exercise', id: linkId(TITLE), updatedMs: NOW - 1000, deleted: false, body: { id: linkId(TITLE), kind: 'link', title: TITLE, targetId: 'ai-1', by: 'person', atMs: NOW - 1000 } },
    ]);
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(0);
  });

  it('links every sure title, each as its own record', async () => {
    const A = 'Zorbo Squat A';
    const B = 'Zorbo Squat B';
    const h = harness([() => ({ items: [...same('high', 'pf-squat', A).items, ...same('high', 'pf-squat', B).items] })], [A, B]);
    await h.mapper.run(ID);
    const links = exRecords(h.store).flatMap((r) => { const l = linkOf(r); return l ? [l.title] : []; }).sort();
    expect(links).toEqual([A, B]);
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

  it('asks again when a waiting proposal points at an exercise that is gone', async () => {
    const h = harness([() => same('medium', 'own-gone')]);
    h.store.putMany(ID, [{ kind: 'exercise', id: proposalId(TITLE, NOW - 5000), updatedMs: NOW - 5000, deleted: false, body: { id: 'x', proposal: { forTitle: TITLE, kind: 'same', targetId: 'own-gone', reason: '', atMs: NOW - 5000 } } }]);
    await h.mapper.run(ID);
    expect(h.prompts).toHaveLength(1);
  });

});

import { exerciseTitles } from '../../../src/shared/exercises';
const exerciseTitlesHas = (e: Parameters<typeof exerciseTitles>[0], t: string) => exerciseTitles(e).includes(t);
