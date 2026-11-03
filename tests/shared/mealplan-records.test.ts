import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { validRecord } from '../../src/coach/tracking/records-api';
import type { TrackedRecord } from '../../src/shared/records';
import { openIdb } from '../../src/web/idbStore';
import { validBody } from '../../src/web/validate';
import { createWebPort } from '../../src/web/webPort';
import { login, NOW, PW_A, PW_B, post, setup } from '../web-server/helpers';

const plan = { week: '2026-11-09', createdMs: 1, source: 'liste', trainingDays: [], people: [{ id: 'pa', name: 'Max' }], you: 'pa',
  meals: [{ day: 0, slot: 'mittag', reuseOf: null, eaters: ['pa'], takeAlong: true, dish: { title: 'Linsen-Bolognese', ingredients: [{ name: 'Rote Linsen', amount: 70, unit: 'g', section: 'Vorrat' }], steps: ['Kochen.'], minutes: 30, proteinG: 28, keepsDays: 3, source: 'liste' } }] };
const mp = (id: string, updatedMs: number, body: unknown): TrackedRecord => ({ kind: 'mealplan', id, updatedMs, deleted: false, body });

describe('the mealplan record kind', () => {
  it('the server keeps it per account like any other record, with no meal logic', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!, b = (await login(app, 'ben', PW_B)).cookie!;
    const res = await post(app, { cookie: a }, [mp('week-2026-11-09', NOW, plan), mp('state-2026-11-09', NOW, { eaters: {}, items: { 'skyr|g': { state: 'gekauft', atMs: NOW } } })]);
    expect(res.json()).toEqual({ accepted: 2, refused: [] });
    const mine = (await app.inject({ method: 'GET', url: '/records', headers: { cookie: a } })).json().records as TrackedRecord[];
    expect(mine.map((r) => r.id).sort()).toEqual(['state-2026-11-09', 'week-2026-11-09']);
    expect((await app.inject({ method: 'GET', url: '/records', headers: { cookie: b } })).json().records).toEqual([]);
  });

  it('the Mac accepts it from the server', () => {
    expect(validRecord(mp('week-2026-11-09', 1, plan))?.kind).toBe('mealplan');
  });

  it('the phone draws a readable plan, skips a broken one and accepts any state body', () => {
    expect(validBody('mealplan', plan)).toBe(true);
    expect(validBody('mealplan', { ...plan, week: 'kaputt' })).toBe(false);
    expect(validBody('mealplan', { eaters: {}, items: {} })).toBe(true);
  });

  it('a phone ignores a record kind it does not know yet and keeps syncing the rest', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const remote = [{ kind: 'shoppinglist2', id: 'x', updatedMs: 5, deleted: false, body: {} }, mp('week-2026-11-09', 5, plan)];
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      if (url === '/me') return json({ name: 'anna' });
      if (init.method === 'POST') return json({ accepted: 0, refused: [] });
      return json({ records: Number(new URL(url, 'http://x').searchParams.get('since')) === 0 ? remote : [], cursor: 2, more: false, reset: false });
    }) as unknown as typeof fetch;
    const store = await openIdb('anna', new IDBFactory());
    const port = createWebPort({ store, fetchFn, account: 'anna', now: () => 1000 });
    expect(await port.sync()).toBe('ok');
    expect((await port.list('mealplan')).map((r) => r.id)).toEqual(['week-2026-11-09']);
    port.dispose();
  });
});
