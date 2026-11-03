import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { TrackedRecord } from '../../src/shared/records';
import { openIdb } from '../../src/web/idbStore';

const base = { id: 'x', title: 'T', name: 'T', startMs: 1, endMs: null, exercises: [], text: 't', status: 'active', atMs: 1 }; // readable for every kind
const rec = (id: string, updatedMs: number, body: unknown = { ...base, id }, kind: TrackedRecord['kind'] = 'workout'): TrackedRecord => ({ kind, id, updatedMs, deleted: false, body });

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
    await a.put(rec('w1', 10, { ...base, v: 1 }));
    // A second connection, which sees only committed data, finds it right after the put resolved.
    const other = await openIdb('anna', f);
    expect((await other.list('workout'))[0]!.body).toEqual({ ...base, v: 1 });
  });

  it('applies applyRecord semantics: older does not overwrite, newer does, ties go by JSON text', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put(rec('w1', 20, { ...base, v: 'new' }));
    await a.put(rec('w1', 10, { ...base, v: 'old' }));
    expect((await a.list('workout'))[0]!.body).toEqual({ ...base, v: 'new' });
    await a.put(rec('w1', 30, { ...base, v: 'newer' }));
    expect((await a.list('workout'))[0]!.body).toEqual({ ...base, v: 'newer' });
    await a.put(rec('w2', 5, { ...base, v: 'a' }));
    await a.put(rec('w2', 5, { ...base, v: 'b' }));
    expect((await a.list('workout')).find((r) => r.id === 'w2')!.body).toEqual({ ...base, v: 'b' });
  });

  it('keeps tombstones in list and separates kinds', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put({ ...rec('w1', 10), deleted: true });
    await a.put(rec('r1', 10, base, 'routine'));
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

describe('idbStore resilience', () => {
  it('reopens after the browser drops the connection (WebKit after backgrounding) and retries the operation', async () => {
    const real = new IDBFactory();
    const conns: IDBDatabase[] = [];
    const factory = { open: (n: string, v?: number) => { const r = real.open(n, v); r.addEventListener('success', () => conns.push(r.result)); return r; } } as unknown as IDBFactory;
    const a = await openIdb('anna', factory);
    await a.put(rec('w1', 10));
    conns[0]!.close(); // the store's handle is now dead: transactions throw InvalidStateError
    await a.put(rec('w2', 10));
    expect((await a.list('workout')).map((r) => r.id).sort()).toEqual(['w1', 'w2']);
    expect(conns.length).toBe(2);
  });

  it('closes its handle on versionchange so an upgrade is never blocked', async () => {
    const real = new IDBFactory();
    const a = await openIdb('anna', real);
    await a.put(rec('w1', 10));
    await new Promise<void>((resolve, reject) => {
      const r = real.open('pandafit-anna', 2);
      r.onupgradeneeded = () => {};
      r.onsuccess = () => { r.result.close(); resolve(); };
      r.onblocked = () => reject(new Error('blocked'));
      r.onerror = () => reject(r.error);
    });
    // Reaching this point means the upgrade was not blocked by our open handle.
  });

  it('skips records whose body the screens cannot draw, but keeps them stored', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put(rec('null-body', 1, null));
    await a.put(rec('no-sets', 1, { id: 'x', title: 't', startMs: 1, endMs: null, exercises: [{ exerciseId: 'e', title: 'T' }] }));
    await a.put(rec('null-entry', 1, { id: 'x', title: 't', startMs: 1, endMs: null, exercises: [null] }));
    await a.put(rec('good', 1, { id: 'good', title: 't', startMs: 1, endMs: null, exercises: [{ exerciseId: 'e', title: 'T', sets: [{ weightKg: 1, reps: 2 }] }] }));
    await a.put({ ...rec('gone', 1, null), deleted: true });
    await a.put(rec('plan-bad', 1, { workout: { name: 'x', exercises: [{ title: 'K' }] } }, 'plan'));
    await a.put(rec('current', 2, { workout: null, mobility: null }, 'plan'));
    await a.put(rec('c', 1, { text: 1 }, 'complaint'));
    expect((await a.list('workout')).map((r) => r.id).sort()).toEqual(['gone', 'good']);
    expect((await a.list('plan')).map((r) => r.id)).toEqual(['current']);
    expect(await a.list('complaint')).toEqual([]);
    expect((await a.changedSince(0)).records.length).toBe(8); // nothing is lost: all of it still goes to the server
  });

  it('downloaded records are not pending, own edits of them are', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.applyMany([rec('r1', 10), rec('r2', 10)]);
    expect(a.counts().pending).toBe(0);
    await a.put(rec('r1', 11));
    expect(a.counts().pending).toBe(1);
  });

  it('a refused record leaves the count when a later edit is accepted', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put(rec('w1', 10));
    await a.addRefused([{ id: 'w1', reason: 'bad' }]);
    expect(a.counts().refused).toBe(1);
    await a.clearRefused(['w1']);
    expect(a.counts().refused).toBe(0);
  });

  it('notifies on cursor changes only when the counts changed', async () => {
    const a = await openIdb('anna', new IDBFactory());
    await a.put(rec('w1', 10));
    let n = 0;
    a.subscribe(() => n++);
    await a.cursors.set({ sent: 0, received: 5 }); // counts the same
    expect(n).toBe(0);
    await a.cursors.set({ sent: 1, received: 5 });
    expect(n).toBe(1);
  });
});

describe('openIdb timeout', () => {
  it('gives up when the browser never answers the open', async () => {
    const factory = { open: () => ({}) } as unknown as IDBFactory;
    await expect(openIdb('anna', factory, { timeoutMs: 30 })).rejects.toThrow(/timeout/);
  });
});
