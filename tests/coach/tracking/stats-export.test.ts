import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordStore } from '../../../src/coach/tracking/store';
import { exportStats } from '../../../src/coach/tracking/stats-export';
import { readStats, STATS_ID, type StatsBody } from '../../../src/shared/stats';

const NOW = new Date(2026, 10, 4, 12).getTime();

let dir: string;
let store: RecordStore;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stats-')); store = new RecordStore({ dir }); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const content = (bikeMinutes = 45): Omit<StatsBody, 'atMs'> => ({
  type: 'stats', goal: 'muscle', muscles: { t1: 'chest' },
  days: [{ date: '2026-11-04', minutes: { bike: bikeMinutes, strength: 0, run: 0, mobility: 0, other: 0 }, hardness: 'easy', legs: false }],
});

const run = (o: { now?: number; here?: string[]; ride?: boolean; ids?: string[]; content?: (id: string) => Omit<StatsBody, 'atMs'> | null } = {}) => exportStats({
  store, profileIds: o.ids ?? ['pa', 'pb'], nowMs: o.now ?? NOW,
  coachHere: (id) => (o.here ?? ['pa', 'pb']).includes(id), noOpenRide: () => !o.ride,
  content: o.content ?? (() => content()),
});
const rec = (id: string) => store.all(id, 'stats').find((r) => r.id === STATS_ID);

describe('the stats record', () => {
  it('a coached profile gets the content with the time it was made', () => {
    expect(run({ ids: ['pa'] })).toEqual(['pa']);
    const r = rec('pa')!;
    expect(r.kind).toBe('stats');
    expect(r.updatedMs).toBe(NOW);
    expect(r.deleted).toBe(false);
    expect(readStats(r.body)).toEqual({ ...content(), atMs: NOW });
  });

  it('a profile coached elsewhere gets nothing', () => {
    expect(run({ here: ['pa'] })).toEqual(['pa']);
    expect(rec('pb')).toBeUndefined();
  });

  it('nothing is written with a ride open, and content is not even asked for', () => {
    let asked = 0;
    expect(run({ ride: true, content: () => { asked++; return content(); } })).toEqual([]);
    expect(asked).toBe(0);
    expect(rec('pa')).toBeUndefined();
    expect(rec('pb')).toBeUndefined();
  });

  it('the same content a second time writes nothing, even later', () => {
    run();
    expect(run({ now: NOW + 60_000 })).toEqual([]);
    expect(rec('pa')!.updatedMs).toBe(NOW);
    expect(readStats(rec('pa')!.body)!.atMs).toBe(NOW);
  });

  it('changed content writes again, always newer than the stored version', () => {
    run();
    expect(run({ now: NOW - 5000, content: () => content(60) })).toEqual(['pa', 'pb']);
    const r = rec('pa')!;
    expect(r.updatedMs).toBe(NOW + 1);
    expect(readStats(r.body)!.days[0]!.minutes.bike).toBe(60);
  });

  it('a profile whose content throws is skipped, the others are still written', () => {
    expect(run({ content: (id) => { if (id === 'pa') throw new Error('broken'); return content(); } })).toEqual(['pb']);
    expect(rec('pa')).toBeUndefined();
    expect(rec('pb')).toBeDefined();
  });

  it('no content writes nothing', () => {
    expect(run({ content: () => null })).toEqual([]);
    expect(rec('pa')).toBeUndefined();
  });

  it('a throwing coachHere skips only that profile', () => {
    const out = exportStats({
      store, profileIds: ['pa', 'pb'], nowMs: NOW, noOpenRide: () => true, content: () => content(),
      coachHere: (id) => { if (id === 'pa') throw new Error('x'); return true; },
    });
    expect(out).toEqual(['pb']);
  });
});
