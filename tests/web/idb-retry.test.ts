import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { TrackedRecord } from '../../src/shared/records';
import { createWorkoutStore } from '../../src/tracking/store';
import type { TrackingPort } from '../../src/tracking/ports';
import { openIdb } from '../../src/web/idbStore';

const base = { id: 'w1', title: 'T', startMs: 1, endMs: null, source: 'pandafit', exercises: [] };
const rec = (updatedMs: number): TrackedRecord => ({ kind: 'workout', id: 'w1', updatedMs, deleted: false, body: base });
const named = (name: string) => Object.assign(new Error(name), { name });

/** Real IndexedDB, with write transactions of its connections failing the way a test says. */
function failing() {
  const real = new IDBFactory();
  const control = { fail: [] as ('start' | 'abort' | 'after-commit')[], err: named('UnknownError'), opens: 0, closes: 0, attempts: 0 };
  const factory = {
    open: (name: string, version?: number) => {
      control.opens++;
      const r = real.open(name, version);
      r.addEventListener('success', () => {
        const d = r.result;
        const transaction = d.transaction.bind(d), close = d.close.bind(d);
        d.close = () => { control.closes++; close(); };
        d.transaction = ((...a: Parameters<IDBDatabase['transaction']>) => {
          if (a[1] !== 'readwrite') return transaction(...a);
          control.attempts++;
          const mode = control.fail.shift();
          if (mode === 'start') throw control.err;
          const tx = transaction(...a);
          if (mode === 'abort') queueMicrotask(() => tx.abort());
          // The commit happens, but the caller hears a failure.
          if (mode === 'after-commit') Object.defineProperty(tx, 'oncomplete', { set() {}, get: () => () => tx.onabort?.(new Event('abort')) });
          return tx;
        }) as IDBDatabase['transaction'];
      });
      return r;
    },
  } as unknown as IDBFactory;
  return { factory, control };
}

describe('a lost IndexedDB connection', () => {
  it.each(['UnknownError', 'AbortError', 'InvalidStateError', 'TransactionInactiveError'])('%s on starting a transaction: drops the handle and retries once', async (name) => {
    const { factory, control } = failing();
    const s = await openIdb('anna', factory);
    const opens = control.opens;
    control.fail = ['start'];
    control.err = named(name);
    expect(await s.put(rec(10))).toEqual({ kept: true, updatedMs: 10 });
    expect(control.opens).toBe(opens + 1);
    expect(control.closes).toBe(1);
    expect((await s.changedSince(0)).records).toHaveLength(1);
  });

  it('an aborted transaction wrote nothing and is repeated: the record is there once', async () => {
    const { factory, control } = failing();
    const s = await openIdb('anna', factory);
    control.fail = ['abort'];
    expect(await s.put(rec(10))).toEqual({ kept: true, updatedMs: 10 });
    const { records, cursor } = await s.changedSince(0);
    expect(records).toHaveLength(1);
    expect(cursor).toBe(1);
  });

  it('a retried write that had in fact committed is harmless: same record, kept, one sequence number, listeners told', async () => {
    const { factory, control } = failing();
    const s = await openIdb('anna', factory);
    let told = 0;
    s.subscribe(() => { told++; });
    control.fail = ['after-commit'];
    expect(await s.put(rec(10))).toEqual({ kept: true, updatedMs: 10 });
    const { records, cursor } = await s.changedSince(0);
    expect(records).toHaveLength(1);
    expect(cursor).toBe(1);
    expect(told).toBeGreaterThan(0);
  });

  it('fails after one retry, with a fresh handle next time', async () => {
    const { factory, control } = failing();
    const s = await openIdb('anna', factory);
    control.fail = ['start', 'start'];
    await expect(s.put(rec(10))).rejects.toThrow('UnknownError');
    expect(control.attempts).toBe(2);
    const opens = control.opens;
    expect(await s.put(rec(11))).toEqual({ kept: true, updatedMs: 11 });
    expect(control.opens).toBe(opens + 1);
  });

  it('a full disk is not retried and shows the "not saved" state', async () => {
    const { factory, control } = failing();
    const s = await openIdb('anna', factory);
    control.fail = ['start', 'start', 'start'];
    control.err = named('QuotaExceededError');
    await expect(s.put(rec(10))).rejects.toThrow('QuotaExceededError');
    expect(control.attempts).toBe(1);
    const port: TrackingPort = { list: (k) => s.list(k), put: (r) => s.put(r), subscribe: () => () => {}, syncState: () => ({ pending: 0, lastOkMs: null }) };
    const store = createWorkoutStore(port, rec(5), () => 1000);
    expect(await store.apply((w) => w)).toBe(false);
    expect(store.view().save).toBe('unsaved');
    store.dispose();
  });
});
