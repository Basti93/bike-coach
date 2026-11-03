import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../../src/coach/tracking/store';
import type { TrackedRecord } from '../../src/shared/records';
import type { TrackingPort } from '../../src/tracking/ports';
import { createWorkoutStore } from '../../src/tracking/store';
import { setup } from '../web-server/helpers';
import { mac, phone, rec, setsOf, wk } from './two-devices';

let close: FastifyInstance | null = null;
afterEach(async () => { await close?.close(); close = null; });

let tick = 1_799_999_000_000;
const now = () => (tick += 1000);
type W = ReturnType<typeof wk>;
const edit = (n: number) => (() => wk(n)) as never;
type Inject = FastifyInstance['inject'];

/** `hook` sits between the phone and the server. The Mac talks to the server directly. */
async function two(hook?: (inject: Inject, o: { method: string; url: string }) => unknown) {
  const s = await setup();
  close = s.app;
  const inject = s.app.inject.bind(s.app) as Inject;
  const proxy = (hook ? { inject: (o: { method: string; url: string }) => hook(inject, o) } : s.app) as FastifyInstance;
  const P = await phone(proxy, () => s.clock.now), M = await mac(s.app, () => s.clock.now);
  const macPort: TrackingPort = {
    put: async (r, o) => M.store.put('p', r, o?.seenMs), list: async (k) => M.store.all('p', k),
    subscribe: () => () => {}, syncState: () => ({ pending: 0, lastOkMs: null }),
  };
  const on = async (d: 'P' | 'M') => {
    const all = await (d === 'P' ? P : M).all();
    return createWorkoutStore(d === 'P' ? P.port : macPort, all.find((r) => r.id === 'w1')!, now);
  };
  return { P, M, on };
}
const copies = (rs: TrackedRecord[]) => rs.filter((r) => r.id !== 'w1');
const first = (rs: TrackedRecord[]) => rs.find((r) => r.id === 'w1')!;
const start = async (P: Awaited<ReturnType<typeof phone>>, n: number) => { await P.port.put(rec(n, now())); };

describe('a device behind by several versions on the same line', () => {
  it('Mac corrects a weight, syncs, removes a set; the phone was closed: no copy', async () => {
    const { P, M, on } = await two();
    await start(P, 20); await P.sync(); await M.sync();
    const m = await on('M');
    await m.apply(edit(20)); await M.sync();
    await m.apply(edit(19)); await M.sync();
    await P.sync(); await M.sync();
    expect(setsOf(first(await P.all()))).toBe(19);
    for (const d of [P, M]) expect(await d.all()).toHaveLength(1);
  });

  it('Mac corrects a weight, syncs, deletes the workout; the phone was closed: it stays deleted, no copy', async () => {
    const { P, M, on } = await two();
    await start(P, 20); await P.sync(); await M.sync();
    const m = await on('M');
    await m.apply(edit(20)); await M.sync();
    await m.remove(); await M.sync();
    await P.sync(); await M.sync();
    expect(first(await P.all()).deleted).toBe(true);
    for (const d of [P, M]) expect(await d.all()).toHaveLength(1);
  });

  it('the line goes on across devices: phone, Mac, phone, and a Mac behind by two sees no conflict', async () => {
    const { P, M, on } = await two();
    await start(P, 8); await P.sync(); await M.sync(); await P.sync();
    const p = await on('P');
    await p.apply(edit(9)); await P.sync();
    await p.apply(edit(10)); await P.sync();
    await p.remove(); await P.sync();
    await M.sync(); await P.sync();
    expect(first(await M.all()).deleted).toBe(true);
    for (const d of [P, M]) expect(await d.all()).toHaveLength(1);
  });

  it('the list stays capped at 20, the newest kept', async () => {
    const { P, on } = await two();
    await start(P, 3); await P.sync();
    const p = await on('P');
    for (let i = 0; i < 30; i++) { await p.apply(edit(3)); await P.sync(); }
    await p.apply(edit(3));
    const body = first(await P.all()).body as { ancestors: number[]; baseMs: number };
    expect(body.ancestors.length).toBeLessThanOrEqual(20);
    expect(body.ancestors).toEqual([...body.ancestors].sort((a, b) => a - b));
    expect(body.baseMs).toBeGreaterThan(body.ancestors.at(-1)!);
  });
});

describe('what is not on the line still gives a copy', () => {
  it('an offline edit on the phone is not on the Mac\'s line, however far the Mac went', async () => {
    const { P, M, on } = await two();
    await start(P, 0); await P.sync(); await M.sync();
    const p = await on('P');
    await p.apply(edit(20)); await P.sync();  // on the server, the Mac has not seen it
    const m = await on('M');
    for (const n of [1, 2, 3]) { await m.apply(edit(n)); await M.sync(); }
    await P.sync(); await M.sync();
    for (const d of [P, M]) expect(copies(await d.all()).map(setsOf)).toEqual([20]);
  });

  it('H1: a stale write with no base (the reply to the first send was lost) keeps the 20 as a copy', async () => {
    let lose = false;
    const { P, M, on } = await two(async (inject, o) => {
      const r = await inject(o as never);
      if (lose && o.method === 'POST' && o.url === '/records') { lose = false; throw new Error('reply lost'); }
      return r;
    });
    await start(P, 5);
    lose = true; await P.sync();
    await M.sync();
    const m = await on('M'); await m.apply(edit(20)); await M.sync();
    const p = await on('P'); await p.apply(edit(6));
    expect((first(await P.all()).body as { baseMs?: number }).baseMs).toBeUndefined();
    await P.sync(); await M.sync(); await P.sync();
    for (const d of [P, M]) expect(copies(await d.all()).map(setsOf)).toEqual([20]);
  });

  it('H2: a download that lost does not count as seen, so the next edit is still a conflict', async () => {
    let after: (() => Promise<void>) | null = null, failPost = false;
    const { P, M, on } = await two(async (inject, o) => {
      if (failPost && o.method === 'POST' && o.url === '/records') { failPost = false; throw new Error('offline'); }
      if (after && o.method === 'GET' && o.url.startsWith('/records')) { const f = after; after = null; const r = await inject(o as never); await f(); return r; }
      return inject(o as never);
    });
    await start(P, 0); await P.sync(); await M.sync();
    const m = await on('M'); await m.apply(edit(20)); await M.sync();
    const p = await on('P');
    after = async () => { await p.apply(edit(1)); failPost = true; };
    await P.sync();
    await p.apply(edit(2));
    await P.sync(); await M.sync(); await P.sync();
    for (const d of [P, M]) expect(copies(await d.all()).map(setsOf)).toEqual([20]);
  });
});

describe('no base', () => {
  const store = () => new RecordStore({ dir: `${process.env.TMPDIR ?? '/tmp'}/pf-anc-${Math.random().toString(36).slice(2)}` });
  it('a Hevy version with no base replaces with no copy; so does an import', () => {
    const s = store();
    s.putMany('p', [rec(5, 10)], 'remote');
    s.putMany('p', [rec(1, 20, { body: { ...wk(1), source: 'hevy' } })], 'remote');
    expect(s.all('p', 'workout')).toHaveLength(1);
    const t = store();
    t.putMany('p', [rec(5, 10)], 'remote');
    t.putMany('p', [rec(1, 20)], 'import');
    expect(t.all('p', 'workout')).toHaveLength(1);
  });
  it('a kept copy with no base meets nothing: on arrival nothing is held, and arriving again changes nothing', async () => {
    const { P, M, on } = await two();
    await start(P, 20); await P.sync();
    await M.sync();
    const p = await on('P'); await p.apply(edit(21)); await P.sync();
    const m = await on('M'); await m.apply(edit(1)); await M.sync();
    for (let i = 0; i < 3; i++) { await P.sync(); await M.sync(); }
    for (const d of [P, M]) {
      const c = copies(await d.all());
      expect(c.map(setsOf)).toEqual([21]);
      expect((c[0]!.body as { baseMs?: number; ancestors?: number[] }).baseMs).toBeUndefined();
      expect((c[0]!.body as { ancestors?: number[] }).ancestors).toBeUndefined();
    }
  });
});

describe('H5: a held body that is malformed', () => {
  it('does not stop the replacement, gives no copy where it cannot', () => {
    const s = new RecordStore({ dir: `${process.env.TMPDIR ?? '/tmp'}/pf-anc-${Math.random().toString(36).slice(2)}` });
    const w = wk(3) as W;
    const bad = { ...w, exercises: [...w.exercises, { rid: 'x', title: 'y' }, null] };
    s.putMany('p', [rec(0, 10, { body: bad })], 'remote');
    s.putMany('p', [rec(0, 20, { deleted: true, body: { ...w, baseMs: 123 } })], 'remote');
    expect(s.all('p', 'workout').find((r) => r.id === 'w1')!.deleted).toBe(true);
    const c = s.all('p', 'workout').filter((r) => r.id !== 'w1');
    expect(c.map(setsOf)).toEqual([3]);
    s.putMany('p', [rec(0, 30, { body: { id: 'w1', exercises: 'nonsense' } })], 'remote');
    s.putMany('p', [rec(0, 40, { deleted: true, body: { baseMs: 1 } })], 'remote');
    expect(s.all('p', 'workout').find((r) => r.id === 'w1')!.updatedMs).toBe(40);
  });
});
