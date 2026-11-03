import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { validRecord } from '../../src/coach/tracking/records-api';
import type { TrackedRecord } from '../../src/shared/records';
import { readTogether } from '../../src/shared/together';
import { openIdb } from '../../src/web/idbStore';
import { validBody } from '../../src/web/validate';
import { createWebPort } from '../../src/web/webPort';
import { login, NOW, PW_A, PW_B, post, setup } from '../web-server/helpers';

const togetherBody = {
  week: NOW - 2 * 86_400_000, atMs: NOW, you: 'pa',
  people: [{ profileId: 'pa', name: 'Max', ridesThisWeek: 2, minutesThisWeek: 75, wordsLearned: 12, weeks: Array(12).fill(0) }],
  recent: [{ name: 'Max', startedAtMs: NOW - 3_600_000, sessionName: 'Grundlage', minutes: 45 }],
  metres: 1200, lastRideMetres: 450, peak: { name: 'Mont Ventoux', done: 100, total: 1600, next: 'Stilfser Joch' },
  summits: [{ name: 'Alpe d’Huez', atMs: NOW - 86_400_000 }], climbed: [], climbing: [{ who: 'Max', name: 'Alpe d’Huez', pct: 40 }],
};
const tg = (body: unknown): TrackedRecord => ({ kind: 'together', id: 'current', updatedMs: NOW, deleted: false, body });

describe('the together record kind', () => {
  it('the server keeps it per account like any other record', async () => {
    const { app } = await setup();
    const a = (await login(app, 'anna', PW_A)).cookie!, b = (await login(app, 'ben', PW_B)).cookie!;
    expect((await post(app, { cookie: a }, [tg(togetherBody)])).json()).toEqual({ accepted: 1, refused: [] });
    expect((await app.inject({ method: 'GET', url: '/records', headers: { cookie: a } })).json().records.map((r: TrackedRecord) => r.kind)).toEqual(['together']);
    expect((await app.inject({ method: 'GET', url: '/records', headers: { cookie: b } })).json().records).toEqual([]);
  });

  it('the Mac accepts it back from the server', () => {
    expect(validRecord(tg(togetherBody))?.kind).toBe('together');
  });

  it('the phone draws a readable one and skips a broken one', () => {
    expect(validBody('together', togetherBody)).toBe(true);
    expect(readTogether(togetherBody)?.people[0]?.name).toBe('Max');
    expect(validBody('together', { ...togetherBody, people: 'x' })).toBe(false);
    expect(validBody('together', { ...togetherBody, peak: null })).toBe(false);
    expect(validBody('together', { ...togetherBody, recent: [{ name: 3 }] })).toBe(false);
    expect(readTogether(null)).toBeNull();
  });

  it('the phone syncs it into its store and lists it', async () => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      if (url === '/me') return json({ name: 'anna' });
      if (init.method === 'POST') return json({ accepted: 0, refused: [] });
      return json({ records: Number(new URL(url, 'http://x').searchParams.get('since')) === 0 ? [tg(togetherBody)] : [], cursor: 1, more: false, reset: false });
    }) as unknown as typeof fetch;
    const store = await openIdb('anna', new IDBFactory());
    const port = createWebPort({ store, fetchFn, account: 'anna', now: () => 1000 });
    expect(await port.sync()).toBe('ok');
    expect((await port.list('together')).map((r) => r.id)).toEqual(['current']);
    port.dispose();
  });
});
