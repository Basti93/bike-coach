import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RecordStore } from '../../../src/coach/tracking/store';
import type { TrackedRecord } from '../../../src/shared/records';

const rec = (id: string, updatedMs: number, body: unknown = { n: id }, kind: TrackedRecord['kind'] = 'workout'): TrackedRecord => ({ kind, id, updatedMs, deleted: false, body });

describe('RecordStore', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-')); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('a put survives a restart', () => {
    new RecordStore({ dir }).put('a', rec('w1', 1));
    expect(new RecordStore({ dir }).all('a')).toEqual([rec('w1', 1)]);
  });

  it('filters by kind', () => {
    const s = new RecordStore({ dir });
    s.put('a', rec('w1', 1));
    s.put('a', rec('r1', 1, {}, 'routine'));
    expect(s.all('a', 'routine').map(r => r.id)).toEqual(['r1']);
  });

  it('a broken file starts empty and keeps the broken file aside', () => {
    fs.writeFileSync(path.join(dir, 'a.json'), '{not json');
    const s = new RecordStore({ dir });
    expect(s.all('a')).toEqual([]);
    s.put('a', rec('w1', 1));
    const aside = fs.readdirSync(dir).filter(f => f.startsWith('a.json.broken'));
    expect(aside.length).toBe(1);
    expect(fs.readFileSync(path.join(dir, aside[0]), 'utf8')).toBe('{not json');
    expect(new RecordStore({ dir }).all('a').length).toBe(1);
  });

  it('profiles do not see each other', () => {
    const s = new RecordStore({ dir });
    s.put('a', rec('w1', 1));
    expect(s.all('b')).toEqual([]);
    expect(s.changedSince('b', 0).records).toEqual([]);
  });

  it('profile ids with odd characters stay inside the folder', () => {
    new RecordStore({ dir }).put('../x/y', rec('w1', 1));
    expect(fs.readdirSync(dir)).toEqual([`${encodeURIComponent('../x/y')}.json`]);
  });

  it('changedSince returns only later local changes', () => {
    const s = new RecordStore({ dir });
    s.put('a', rec('w1', 1));
    const first = s.changedSince('a', 0);
    expect(first.records.map(r => r.id)).toEqual(['w1']);
    s.put('a', rec('w1', 1)); // repeated put changes nothing
    expect(s.changedSince('a', first.cursor)).toEqual({ records: [], cursor: first.cursor });
    s.put('a', rec('w2', 2));
    const next = s.changedSince('a', first.cursor);
    expect(next.records.map(r => r.id)).toEqual(['w2']);
    expect(next.cursor).toBeGreaterThan(first.cursor);
    expect(new RecordStore({ dir }).changedSince('a', first.cursor).records.map(r => r.id)).toEqual(['w2']);
  });

  it('an older record never wins and a loser does not raise the cursor', () => {
    const s = new RecordStore({ dir });
    s.put('a', rec('w1', 5, { v: 'new' }));
    const c = s.changedSince('a', 0).cursor;
    s.put('a', rec('w1', 3, { v: 'old' }));
    s.put('a', rec('w1', 3, { v: 'old' }));
    expect(s.all('a')[0].body).toEqual({ v: 'new' });
    expect(s.changedSince('a', c).records).toEqual([]);
    expect(s.overwritten('a').length).toBe(1);
  });

  it('keeps the overwritten copy, and tombstones stay', () => {
    const s = new RecordStore({ dir });
    s.put('a', rec('w1', 1, { v: 1 }));
    s.put('a', { ...rec('w1', 2, null), deleted: true });
    expect(s.all('a')[0].deleted).toBe(true);
    expect(s.overwritten('a').map(r => r.body)).toEqual([{ v: 1 }]);
  });

  it('caps the overwritten list at 200 per profile', () => {
    const s = new RecordStore({ dir });
    for (let i = 1; i <= 250; i++) s.put('a', rec('w1', i, { i }));
    const o = s.overwritten('a');
    expect(o.length).toBe(200);
    expect((o[o.length - 1].body as { i: number }).i).toBe(249);
  });

  it('a crash between temp file and rename keeps the old data', () => {
    const s = new RecordStore({ dir });
    s.put('a', rec('w1', 1));
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('crash'); });
    expect(() => s.put('a', rec('w2', 2))).toThrow();
    vi.restoreAllMocks();
    expect(new RecordStore({ dir }).all('a').map(r => r.id)).toEqual(['w1']);
  });

  it('a stale temp file from a crash is ignored', () => {
    new RecordStore({ dir }).put('a', rec('w1', 1));
    fs.writeFileSync(path.join(dir, 'a.json.tmp'), '{"half');
    const s = new RecordStore({ dir });
    expect(s.all('a').map(r => r.id)).toEqual(['w1']);
    s.put('a', rec('w2', 2));
    expect(new RecordStore({ dir }).all('a').length).toBe(2);
  });
});
