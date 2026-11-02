import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { openIdb } from '../../src/web/idbStore';
import { createWebPort } from '../../src/web/webPort';
import { PW_A, setup } from '../web-server/helpers';

let app: FastifyInstance | null = null;
afterEach(async () => { await app?.close(); app = null; });

/** A browser-like fetch on top of the real server: keeps the cookie like a browser would, sends same-origin headers. */
const browser = (a: FastifyInstance) => {
  let cookie = '';
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const res = await a.inject({
      method: (init.method ?? 'GET') as 'GET' | 'POST', url,
      headers: { host: 'pf.test', origin: 'http://pf.test', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      payload: init.body as string | undefined,
    });
    const set = /pf_session=[0-9a-f]*/.exec(String(res.headers['set-cookie']))?.[0];
    if (set) cookie = set.endsWith('=') ? '' : set;
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchFn };
};

describe('web app against the real server', () => {
  it('login, put a workout, sync, and read it from a second fresh IndexedDB', async () => {
    const s = await setup();
    app = s.app;
    const phone1 = browser(app);
    expect((await phone1.fetchFn('/login', { method: 'POST', body: JSON.stringify({ name: 'anna', password: PW_A }) })).status).toBe(200);
    expect((await (await phone1.fetchFn('/me')).json() as { name: string }).name).toBe('anna');

    const one = createWebPort({ store: await openIdb('anna', new IDBFactory()), fetchFn: phone1.fetchFn, now: () => s.clock.now, events: new EventTarget() });
    const w = { kind: 'workout' as const, id: 'w-1', updatedMs: s.clock.now, deleted: false, body: { id: 'w-1', title: 'Beine', startMs: 1, endMs: null, source: 'pandafit', exercises: [] } };
    await one.put(w);
    expect(await one.sync()).toBe('ok');
    expect(one.syncState().pending).toBe(0);
    one.dispose();

    const phone2 = browser(app);
    await phone2.fetchFn('/login', { method: 'POST', body: JSON.stringify({ name: 'anna', password: PW_A }) });
    const two = createWebPort({ store: await openIdb('anna', new IDBFactory()), fetchFn: phone2.fetchFn, now: () => s.clock.now, events: new EventTarget() });
    expect(await two.sync()).toBe('ok');
    expect(await two.list('workout')).toEqual([w]);
    two.dispose();
  });

  it('without a login the sync answers login and keeps the data', async () => {
    const s = await setup();
    app = s.app;
    const store = await openIdb('anna', new IDBFactory());
    const port = createWebPort({ store, fetchFn: browser(app).fetchFn, now: () => s.clock.now, events: new EventTarget() });
    await port.put({ kind: 'workout', id: 'w-1', updatedMs: 5, deleted: false, body: {} });
    expect(await port.sync()).toBe('login');
    expect(port.syncState().pending).toBe(1);
    port.dispose();
  });
});
