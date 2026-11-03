import { describe, it, expect } from 'vitest';
import { syncRecords } from '../../src/tracking/sync';
import type { TrackedRecord } from '../../src/shared/records';

const rec = (id: string, updatedMs = 1, body: unknown = { n: id }): TrackedRecord => ({ kind: 'workout', id, updatedMs, deleted: false, body });

/** A tiny local store with a sequence number, like RecordStore. */
function fake() {
  let seq = 0;
  const entries = new Map<string, { r: TrackedRecord; seq: number }>();
  const put = (r: TrackedRecord) => { if (JSON.stringify(entries.get(r.id)?.r) !== JSON.stringify(r)) entries.set(r.id, { r, seq: ++seq }); };
  const saved = { sent: 0, received: 0 };
  const h = {
    put, saved, entries, failSet: false, applied: [] as string[][],
    local: {
      changedSince: async (c: number) => ({ records: [...entries.values()].filter((e) => e.seq > c).sort((a, b) => a.seq - b.seq).map((e) => e.r), cursor: seq }),
      apply: async (r: TrackedRecord) => { h.applied.push([r.id]); put(r); },
      applyMany: async (rs: TrackedRecord[]) => { h.applied.push(rs.map((r) => r.id)); rs.forEach(put); },
    },
    cursors: {
      get: async () => ({ ...saved }),
      set: async (c: { sent: number; received: number }) => { if (h.failSet) throw new Error('disk'); Object.assign(saved, c); },
    },
  };
  return h;
}
type Page = { records: TrackedRecord[]; cursor: number; more?: boolean; reset?: boolean };
const noRefusals = async () => ({ refused: [] as { id: string; reason: string }[] });

describe('syncRecords', () => {
  it('sends local changes and fetches remote ones', async () => {
    const h = fake();
    h.put(rec('a'));
    const sent: string[][] = [];
    await syncRecords({
      local: h.local, cursors: h.cursors,
      send: async (rs) => { sent.push(rs.map((r) => r.id)); return { refused: [] }; },
      fetchSince: async () => ({ records: [rec('b')], cursor: 7 }),
    });
    expect(sent).toEqual([['a']]);
    expect(h.entries.has('b')).toBe(true);
    expect(h.saved.received).toBe(7);
  });

  it('a failure keeps the cursors and retries', async () => {
    const h = fake();
    h.put(rec('a'));
    let fail = true;
    const send = async (rs: TrackedRecord[]) => { if (fail) throw new Error('offline'); void rs; return { refused: [] }; };
    const run = () => syncRecords({ local: h.local, cursors: h.cursors, send, fetchSince: async () => ({ records: [], cursor: 0 }) });
    await expect(run()).rejects.toThrow('offline');
    expect(h.saved.sent).toBe(0);
    fail = false;
    const sent: string[] = [];
    await syncRecords({ local: h.local, cursors: h.cursors, send: async (rs) => { sent.push(...rs.map((r) => r.id)); return { refused: [] }; }, fetchSince: async () => ({ records: [], cursor: 0 }) });
    expect(sent).toEqual(['a']);
    expect(h.saved.sent).toBe(1);
  });

  it('a remote record does not get sent back forever', async () => {
    const h = fake();
    const sent: string[] = [];
    const opts = {
      local: h.local, cursors: h.cursors,
      send: async (rs: TrackedRecord[]) => { sent.push(...rs.map((r) => r.id)); return { refused: [] }; },
      fetchSince: async (c: number) => (c === 0 ? { records: [rec('from-phone')], cursor: 3 } : { records: [], cursor: c }),
    };
    await syncRecords(opts);
    await syncRecords(opts);
    await syncRecords(opts);
    expect(sent).toEqual([]);
    // A local change next to a remote one is still sent.
    h.put(rec('mine'));
    await syncRecords({ ...opts, fetchSince: async () => ({ records: [rec('other')], cursor: 4 }) });
    expect(sent).toEqual(['mine']);
  });

  it('refused records are reported, kept, and the queue moves on', async () => {
    const h = fake();
    h.put(rec('bad')); h.put(rec('good'));
    const reported: { id: string; reason: string }[][] = [];
    const sentIds: string[][] = [];
    const opts = {
      local: h.local, cursors: h.cursors, refused: (r: { id: string; reason: string }[]) => { reported.push(r); },
      send: async (rs: TrackedRecord[]) => { sentIds.push(rs.map((r) => r.id)); return { refused: rs.filter((r) => r.id === 'bad').map((r) => ({ id: r.id, reason: 'updatedMs too far ahead' })) }; },
      fetchSince: async () => ({ records: [], cursor: 0 }),
    };
    const res = await syncRecords(opts);
    expect(reported).toEqual([[{ id: 'bad', reason: 'updatedMs too far ahead' }]]);
    expect(res.refused).toEqual([{ id: 'bad', reason: 'updatedMs too far ahead' }]);
    expect(h.entries.has('bad')).toBe(true);
    expect(h.saved.sent).toBe(2);
    await syncRecords(opts);
    expect(sentIds).toEqual([['bad', 'good']]);
  });

  it('sends at most 200 records and below 5 MB per request', async () => {
    const h = fake();
    for (let i = 0; i < 450; i++) h.put(rec(`r${i}`));
    const sizes: number[] = [];
    await syncRecords({ local: h.local, cursors: h.cursors, send: async (rs) => { sizes.push(rs.length); return { refused: [] }; }, fetchSince: async () => ({ records: [], cursor: 0 }) });
    expect(sizes).toEqual([200, 200, 50]);
    const big = fake();
    for (let i = 0; i < 4; i++) big.put(rec(`b${i}`, 1, { text: 'x'.repeat(1_900_000) }));
    const bytes: number[] = [];
    await syncRecords({ local: big.local, cursors: big.cursors, send: async (rs) => { bytes.push(rs.length); expect(JSON.stringify(rs).length).toBeLessThan(5_000_000); return { refused: [] }; }, fetchSince: async () => ({ records: [], cursor: 0 }) });
    expect(bytes).toEqual([2, 2]);
  });

  it('pages until no more, storing the cursor per page so a failure resumes', async () => {
    const h = fake();
    const pages: Page[] = [{ records: [rec('p1')], cursor: 5, more: true }, { records: [rec('p2')], cursor: 9, more: true }, { records: [rec('p3')], cursor: 12, more: false }];
    const asked: number[] = [];
    let failAt = 1;
    const fetchSince = async (c: number): Promise<Page> => {
      asked.push(c);
      const i = pages.findIndex((p) => p.cursor > c);
      if (i === failAt) { failAt = -1; throw new Error('timeout'); }
      return pages[i]!;
    };
    const opts = { local: h.local, cursors: h.cursors, send: noRefusals, fetchSince };
    await expect(syncRecords(opts)).rejects.toThrow('timeout');
    expect(h.saved.received).toBe(5);
    expect(h.entries.has('p1')).toBe(true);
    await syncRecords(opts);
    expect(asked).toEqual([0, 5, 5, 9]);
    expect(h.saved.received).toBe(12);
    expect(h.applied.map((a) => a.join())).toEqual(['p1', 'p2', 'p3']);
  });

  it('a reset restarts from the new cursor and sends everything again', async () => {
    const h = fake();
    h.put(rec('a'));
    h.saved.sent = 1; h.saved.received = 500;
    const sent: string[][] = [];
    await syncRecords({
      local: h.local, cursors: h.cursors,
      send: async (rs) => { sent.push(rs.map((r) => r.id)); return { refused: [] }; },
      fetchSince: async () => ({ records: [rec('z')], cursor: 4, more: false, reset: true }),
    });
    expect(h.saved.received).toBe(4);
    expect(sent.flat()).toContain('a');
  });

  it('stops quietly when it may not continue', async () => {
    const h = fake();
    h.put(rec('a'));
    let calls = 0;
    await syncRecords({ local: h.local, cursors: h.cursors, mayContinue: () => false, send: async () => { calls++; return { refused: [] }; }, fetchSince: async () => { calls++; return { records: [], cursor: 0 }; } });
    expect(calls).toBe(0);
    expect(h.saved).toEqual({ sent: 0, received: 0 });
  });
});
