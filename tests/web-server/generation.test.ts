import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountLinks } from '../../src/coach/tracking/link';
import { AccountSync } from '../../src/coach/tracking/mac-sync';
import { RecordStore } from '../../src/coach/tracking/store';
import { syncRecords } from '../../src/tracking/sync';
import { openIdb } from '../../src/web/idbStore';
import { createWebPort } from '../../src/web/webPort';
import { buildServer } from '../../web-server';
import type { TrackedRecord } from '../../src/shared/records';
import { login, PW_A, setup } from './helpers';

let current: FastifyInstance | null = null;
afterEach(async () => { await current?.close(); current = null; });

const rec = (id: string, updatedMs = 10): TrackedRecord => ({ kind: 'routine', id, updatedMs, deleted: false, body: { id } });
const generation = async (a: FastifyInstance, cookie: string) => (await a.inject({ method: 'GET', url: '/records', headers: { cookie } })).json().generation as string;

/** Runs the real backup script's Node part against a database file, with its paths moved to a temp folder. */
function backup(dbPath: string): string {
  const script = fs.readFileSync(path.join(__dirname, '../../web-server/backup.sh'), 'utf8');
  const js = /<<'JS'\n([\s\S]*?)\nJS\n/.exec(script)![1]!;
  const out = path.join(path.dirname(dbPath), 'backup.db');
  const code = js.replaceAll('/data/pandafit.db', dbPath).replaceAll('/data/backup.db', out);
  execFileSync(process.execPath, ['--no-warnings', '-'], { input: code });
  return out;
}

async function world() {
  const s = await setup();
  current = s.app;
  const { dbPath, clock } = s;
  const start = () => { current = buildServer({ dbPath, nowMs: () => clock.now }); return current; };
  const restoreFrom = async (copy: string) => {
    await current!.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
    fs.copyFileSync(copy, dbPath);
    start();
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-gen-'));
  const inject = async (url: string, init: RequestInit = {}, extra: Record<string, string> = {}) => {
    const res = await current!.inject({ method: (init.method ?? 'GET') as 'GET' | 'POST', url, headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string>), ...extra }, payload: init.body as string | undefined });
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } });
  };
  // Phone with a session cookie.
  let cookie = '';
  const phoneFetch = (async (url: string, init: RequestInit = {}) => {
    const r = await inject(url, init, { host: 'pf.test', origin: 'http://pf.test', ...(cookie ? { cookie } : {}) });
    const set = /pf_session=[0-9a-f]+/.exec(r.headers.get('set-cookie') ?? '')?.[0];
    if (set) cookie = set;
    return r;
  }) as unknown as typeof fetch;
  const l = await current!.inject({ method: 'POST', url: '/login', payload: { name: 'anna', password: PW_A } });
  cookie = /pf_session=[0-9a-f]+/.exec(String(l.headers['set-cookie']))![0]!;
  const idb = await openIdb('anna', new IDBFactory());
  const phone = createWebPort({ store: idb, account: 'anna', fetchFn: phoneFetch, now: () => clock.now, events: new EventTarget(), intervalMs: 1e9 });
  // Mac with a device token.
  const macFetch = ((url: string, init: RequestInit = {}) => inject(String(url).replace('http://localhost', ''), init)) as unknown as typeof fetch;
  const store = new RecordStore({ dir: path.join(dir, 't') });
  const links = new AccountLinks({ dir: path.join(dir, 'a'), fetchFn: macFetch });
  await links.link('p', 'http://localhost', 'anna', PW_A);
  let off = 0;
  const macSync = new AccountSync({
    links, store, nowMs: () => clock.now + off, fetchFn: macFetch, noOpenRide: () => true,
    coach: { state: () => ({ complaints: [] }), addComplaintFromText() {}, updateComplaint() {} } as never,
    gym: { state: () => ({ next: null }), enabled: () => false, start() {}, workoutFinished() {} } as never,
    mobility: { view: () => ({ session: null, askFeel: false }) } as never,
  });
  const mac = async () => { off += 61_000; await macSync.tick('p'); };
  const serverIds = async () => ((await current!.inject({ method: 'GET', url: '/records', headers: { cookie } })).json().records as TrackedRecord[]).map((r) => r.id).sort();
  return { ...s, phone, idb, store, mac, backup: () => backup(dbPath), restoreFrom, serverIds, cookieOf: () => cookie };
}

describe('the database generation', () => {
  it('comes with every page, and stays across restarts', async () => {
    const s = await setup();
    current = s.app;
    const { cookie } = await login(s.app, 'anna', PW_A);
    const g = await generation(s.app, cookie!);
    expect(g).toMatch(/^[0-9a-f]{32}$/);
    await s.app.close();
    current = buildServer({ dbPath: s.dbPath, nowMs: () => s.clock.now });
    expect(await generation(current, cookie!)).toBe(g);
  });

  it('a backup taken by the real script comes up under a new generation, every time it is restored', async () => {
    const w = await world();
    const g0 = await generation(current!, w.cookieOf());
    const copy = w.backup();
    const spare = `${copy}.spare`;
    fs.copyFileSync(copy, spare);
    await w.restoreFrom(spare);
    const g1 = await generation(current!, w.cookieOf());
    expect(g1).not.toBe(g0);
    // Stays once it has come up.
    await current!.close();
    current = buildServer({ dbPath: w.dbPath });
    expect(await generation(current, w.cookieOf())).toBe(g1);
    // The same backup restored a second time: new again.
    fs.copyFileSync(copy, spare);
    await w.restoreFrom(spare);
    expect(await generation(current!, w.cookieOf())).not.toBe(g1);
  });
});

describe('a restore with two devices', () => {
  it('the second device re-sends what only it holds and takes what it lacks, also after the first filled the server up', async () => {
    const w = await world();
    await w.phone.put(rec('before-phone'));
    w.store.put('p', rec('before-mac'));
    await w.phone.sync(); await w.mac(); await w.phone.sync();
    const copy = w.backup();

    // After the backup: each device gets something only it holds. They are sent, then the server loses them.
    await w.phone.put(rec('after-phone'));
    w.store.put('p', rec('after-mac'));
    await w.phone.sync(); await w.mac();
    // Enough records so that the first device lifts the server past the second device's stale cursor.
    for (let i = 0; i < 12; i++) await w.phone.put(rec(`phone-${i}`));
    await w.phone.sync();
    await w.restoreFrom(copy);

    await w.phone.sync(); // the first device fills the server up again
    await w.mac();        // the second must not think nothing happened
    await w.phone.sync();
    const ids = (await w.serverIds());
    expect(ids).toContain('after-mac');
    expect(ids).toContain('after-phone');
    expect(w.store.all('p', 'routine').map((r) => r.id)).toContain('after-phone');
    expect((await w.idb.changedSince(0)).records.map((r) => r.id)).toContain('after-mac');
    w.phone.dispose();
  });

  it('after a restore, records sent long ago give no kept copies when a newer tombstone is already up', async () => {
    const sets = (n: number) => ({ id: 'w1', title: 'T', startMs: 1, endMs: 5, source: 'pandafit', exercises: [{ exerciseId: 'x', title: 'X', supersetId: null, notes: '', sets: Array.from({ length: n }, () => ({ type: 'normal', weightKg: 1, reps: 1, durationS: null, doneMs: 3 })) }] });
    const w: TrackedRecord = { kind: 'workout', id: 'w1', updatedMs: 10, deleted: false, body: sets(5) };
    const entries = [w];
    let top = 1;
    const saved: { sent: number; received: number; generation?: string; resend?: boolean } = { sent: 1, received: 7, generation: 'old' };
    await syncRecords({
      local: {
        changedSince: async (c) => ({ records: c === 0 ? entries : [], cursor: top }),
        apply: async (r) => { entries[0] = r; top++; },
        put: async (r) => { entries.push(r); },
      },
      cursors: { get: async () => ({ ...saved }), set: async (c) => { Object.assign(saved, c); } },
      send: async () => ({ refused: [] }),
      // Another device has already put a newer tombstone up; this device had sent w1 long ago.
      fetchSince: async () => ({ records: [{ ...w, updatedMs: 20, deleted: true, body: sets(0) }], cursor: 1, generation: 'new' }),
    });
    expect(entries.map((r) => r.id)).toEqual(['w1']);
    expect(saved.generation).toBe('new');
    expect(saved.received).toBe(1);
    expect(saved.resend).toBeFalsy();
  });

  it('a failed resend is taken up again by the next run', async () => {
    const saved: { sent: number; received: number; generation?: string; resend?: boolean } = { sent: 2, received: 7, generation: 'old' };
    const r = rec('a');
    const local = { changedSince: async (c: number) => ({ records: c === 0 ? [r] : [], cursor: 2 }), apply: async () => {} };
    const cursors = { get: async () => ({ ...saved }), set: async (c: typeof saved) => { Object.assign(saved, c); } };
    const fetchSince = async () => ({ records: [], cursor: 0, generation: 'new' });
    await expect(syncRecords({ local, cursors, fetchSince, send: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
    expect(saved).toMatchObject({ generation: 'new', resend: true, sent: 2, received: 0 });
    const sent: string[] = [];
    await syncRecords({ local, cursors, fetchSince, send: async (rs) => { sent.push(...rs.map((x) => x.id)); return { refused: [] }; } });
    expect(sent).toEqual(['a']);
    expect(saved.resend).toBeFalsy();
  });
});
