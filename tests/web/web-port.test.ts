import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { TrackedRecord } from '../../src/shared/records';
import { openIdb } from '../../src/web/idbStore';
import { createWebPort } from '../../src/web/webPort';

const rec = (id: string, updatedMs = 10): TrackedRecord => ({ kind: 'workout', id, updatedMs, deleted: false, body: { id } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function server() {
  const s = { status: 200, posted: [] as TrackedRecord[], refuse: [] as string[], down: false, calls: [] as { url: string; init: RequestInit }[], remote: [] as TrackedRecord[] };
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    s.calls.push({ url, init });
    if (s.down) throw new TypeError('offline');
    if (s.status !== 200) return json(s.status, { error: 'x' });
    if (init.method === 'POST') {
      const rs = (JSON.parse(String(init.body)) as { records: TrackedRecord[] }).records;
      s.posted.push(...rs);
      return json(200, { accepted: rs.length, refused: rs.filter((r) => s.refuse.includes(r.id)).map((r) => ({ id: r.id, reason: 'bad' })) });
    }
    const since = Number(new URL(url, 'http://x').searchParams.get('since'));
    return json(200, { records: since === 0 ? s.remote : [], cursor: s.remote.length, more: false, reset: false });
  }) as unknown as typeof fetch;
  return { s, fetchFn };
}

const mk = async (fetchFn: typeof fetch) => {
  const store = await openIdb('anna', new IDBFactory());
  return { store, port: createWebPort({ store, fetchFn, now: () => 1000 }) };
};

describe('webPort', () => {
  it('sends local records with same-origin credentials and no redirects, and receives remote ones', async () => {
    const { s, fetchFn } = server();
    s.remote = [rec('remote')];
    const { port } = await mk(fetchFn);
    await port.put(rec('w1'));
    expect(await port.sync()).toBe('ok');
    expect(s.posted.map((r) => r.id)).toEqual(['w1']);
    expect((await port.list('workout')).map((r) => r.id).sort()).toEqual(['remote', 'w1']);
    for (const c of s.calls) { expect(c.init.credentials).toBe('same-origin'); expect(c.init.redirect).toBe('error'); }
    expect(port.syncState().pending).toBe(0);
    expect(port.syncState().lastOkMs).toBe(1000);
  });

  it('an expired login keeps unsent data and asks to log in again', async () => {
    const { s, fetchFn } = server();
    const { port } = await mk(fetchFn);
    await port.put(rec('w1'));
    s.status = 401;
    expect(await port.sync()).toBe('login');
    expect(port.status()).toBe('login');
    expect(port.syncState().pending).toBe(1);
    expect((await port.list('workout')).length).toBe(1);
    s.status = 200;
    expect(await port.sync()).toBe('ok');
    expect(port.status()).toBe('ok');
  });

  it('being offline is quiet and the data stays pending', async () => {
    const { s, fetchFn } = server();
    const { port } = await mk(fetchFn);
    await port.put(rec('w1'));
    s.down = true;
    expect(await port.sync()).toBe('offline');
    expect(port.syncState().pending).toBe(1);
  });

  it('sync resumes on coming back online', async () => {
    const { s, fetchFn } = server();
    const target = new EventTarget();
    const store = await openIdb('anna', new IDBFactory());
    const port = createWebPort({ store, fetchFn, now: () => 1, events: target });
    await port.put(rec('w1'));
    s.down = true;
    await port.sync();
    s.down = false;
    target.dispatchEvent(new Event('online'));
    await new Promise((r) => setTimeout(r, 50));
    expect(s.posted.map((r) => r.id)).toEqual(['w1']);
    port.dispose();
  });

  it('refused records stay on the device and show up in syncState', async () => {
    const { s, fetchFn } = server();
    s.refuse = ['w1'];
    const { port, store } = await mk(fetchFn);
    await port.put(rec('w1'));
    await port.sync();
    expect(port.syncState().refused).toBe(1);
    expect((await port.list('workout')).length).toBe(1);
    expect(store.counts().refused).toBe(1);
  });

  it('subscribe fires for local and remote changes', async () => {
    const { s, fetchFn } = server();
    s.remote = [rec('r')];
    const { port } = await mk(fetchFn);
    let n = 0;
    port.subscribe(() => n++);
    await port.put(rec('w1'));
    const afterLocal = n;
    await port.sync();
    expect(afterLocal).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(afterLocal);
  });
});
