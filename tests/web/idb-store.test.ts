import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { TrackedRecord } from '../../src/shared/records';
import { openIdb } from '../../src/web/idbStore';

const rec = (id: string, updatedMs: number, body: unknown = { n: id }, kind: TrackedRecord['kind'] = 'workout'): TrackedRecord => ({ kind, id, updatedMs, deleted: false, body });

describe('idbStore', () => {
  it('records survive closing the database', async () => {
    const f = new IDBFactory();
    const a = await openIdb('anna', f);
    await a.put(rec('w1', 10));
    a.close();
    const b = await openIdb('anna', f);
    expect((await b.list('workout')).map((r) => r.id)).toEqual(['w1']);
  });

  it('a set is in IndexedDB before the UI confirms: put resolves only after the transaction completed', async () => {
    const f = new IDBFactory();
    const a = await openIdb('anna', f);
    await a.put(rec('w1', 10, { sets: 1 }));
    // A second connection, which sees only committed data, finds it right after the put resolved.
    const other = await openIdb('anna', f);
    expect((await other.list('workout'))[0]!.body).toEqual({ sets: 1 });
  });

  it('applies applyRecord semantics: older does not overwrite, newer does, ties go by JSON text', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put(rec('w1', 20, { v: 'new' }));
    await a.put(rec('w1', 10, { v: 'old' }));
    expect((await a.list('workout'))[0]!.body).toEqual({ v: 'new' });
    await a.put(rec('w1', 30, { v: 'newer' }));
    expect((await a.list('workout'))[0]!.body).toEqual({ v: 'newer' });
    await a.put(rec('w2', 5, { v: 'a' }));
    await a.put(rec('w2', 5, { v: 'b' }));
    expect((await a.list('workout')).find((r) => r.id === 'w2')!.body).toEqual({ v: 'b' });
  });

  it('keeps tombstones in list and separates kinds', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put({ ...rec('w1', 10), deleted: true });
    await a.put(rec('r1', 10, {}, 'routine'));
    expect((await a.list('workout'))[0]!.deleted).toBe(true);
    expect((await a.list('routine')).length).toBe(1);
  });

  it('subscribe fires after local and remote changes, not after a no-op', async () => {
    const a = await openIdb('anna', new IDBFactory());
    let n = 0;
    const off = a.subscribe(() => n++);
    await a.put(rec('w1', 10));
    await a.applyMany([rec('w2', 10), rec('w3', 10)]);
    expect(n).toBe(2);
    await a.put(rec('w1', 10));
    expect(n).toBe(2);
    off();
    await a.put(rec('w1', 11));
    expect(n).toBe(2);
  });

  it('changedSince returns what changed after the cursor', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put(rec('w1', 10));
    const first = await a.changedSince(0);
    expect(first.records.map((r) => r.id)).toEqual(['w1']);
    await a.put(rec('w2', 10));
    const second = await a.changedSince(first.cursor);
    expect(second.records.map((r) => r.id)).toEqual(['w2']);
    expect((await a.changedSince(second.cursor)).records).toEqual([]);
    await a.put(rec('w1', 11));
    expect((await a.changedSince(second.cursor)).records.map((r) => r.id)).toEqual(['w1']);
  });

  it('cursors and refused records persist; pending counts what is not yet sent', async () => {
    const f = new IDBFactory();
    const a = await openIdb('anna', f);
    await a.put(rec('w1', 10));
    expect(a.counts().pending).toBe(1);
    const ch = await a.changedSince(0);
    await a.cursors.set({ sent: ch.cursor, received: 7 });
    expect(a.counts().pending).toBe(0);
    await a.addRefused([{ id: 'w1', reason: 'bad id' }]);
    a.close();
    const b = await openIdb('anna', f);
    expect(await b.cursors.get()).toEqual({ sent: ch.cursor, received: 7 });
    expect(b.counts()).toEqual({ pending: 0, refused: 1 });
    expect((await b.list('workout')).length).toBe(1);
  });

  it('keeps one database per account', async () => {
    const f = new IDBFactory();
    const a = await openIdb('anna', f);
    await a.put(rec('w1', 10));
    const b = await openIdb('ben', f);
    expect(await b.list('workout')).toEqual([]);
  });
});
