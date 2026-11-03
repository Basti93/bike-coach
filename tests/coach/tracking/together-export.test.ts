import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeTogether } from '../../../src/coach/together';
import type { CoachState } from '../../../src/coach/state';
import { RecordStore } from '../../../src/coach/tracking/store';
import { exportTogether } from '../../../src/coach/tracking/together-export';
import { readTogether, TOGETHER_ID } from '../../../src/shared/together';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 4, 12); // a Wednesday
const profiles = [{ id: 'max', name: 'Max', ftpW: 250 }, { id: 'lena', name: 'Lena', ftpW: 180 }];

const ride = (id: string, daysAgo: number, minutes: number, now = NOW) => ({
  rideId: id, startedAtMs: now - daysAgo * DAY, status: 'finished', sessionId: 's', ftpW: 250, durationS: minutes * 60,
  avgPowerW: 187, normalizedPowerW: 201, intensityFactor: 0.8, tss: 55, avgHrBpm: 143, maxHrBpm: 171, bestMinutePowerW: 333,
  completedFraction: 1, sessionName: 'Grundlage locker',
});
/** A state full of things that must never leave this Mac for the other person. */
const person = (profileId: string, rides: ReturnType<typeof ride>[]): CoachState => ({
  profileId, ftpW: 251, ftpHistory: [{ atMs: NOW, ftpW: 251, source: 'manual' }], wordProgress: {},
  pass: { selectedId: 'alpe-dhuez', distanceM: { 'alpe-dhuez': 3000 } },
  notes: [{ atMs: NOW, text: 'GEHEIME-NOTIZ Knie', reply: 'GEHEIME-ANTWORT' }],
  complaints: [{ id: 'c1', text: 'GEHEIME-BESCHWERDE Rücken', status: 'active', startedMs: NOW, updatedMs: NOW }],
  feedback: { [rides[0]?.rideId ?? 'x']: 'hard' }, debriefs: {}, rules: [{ atMs: NOW, text: 'GEHEIME-REGEL' }],
  changes: [], summaries: rides, processedRides: [], awaitingFeedback: null, dirty: false, dirtySinceMs: null, lastError: null, lastAttemptMs: null,
  phase: { name: 'Aufbau', weeksLeft: 2, goal: 'GEHEIMES-ZIEL' }, ftpForecast: [],
  next: { session: { id: 's', name: 'x' }, reason: 'GEHEIMER-GRUND', source: 'rules' },
} as unknown as CoachState);

let dir: string;
let store: RecordStore;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-together-')); store = new RecordStore({ dir }); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const run = (o: { states: CoachState[]; now?: number; linked?: string[]; ride?: boolean; ids?: string[] }) => exportTogether({
  store, profileIds: o.ids ?? ['max', 'lena'], nowMs: o.now ?? NOW,
  linked: (id) => (o.linked ?? ['max', 'lena']).includes(id), noOpenRide: () => !o.ride,
  together: () => computeTogether(profiles, o.states, o.now ?? NOW),
});
const rec = (id: string) => store.all(id, 'together').find((r) => r.id === TOGETHER_ID);
const both = () => [person('max', [ride('m1', 1, 60), ride('m2', 9, 30)]), person('lena', [ride('l1', 0, 45)])];

describe('the together record', () => {
  it('every linked account gets the combined view the Mac page shows, with its own person marked', () => {
    expect(run({ states: both() }).sort()).toEqual(['lena', 'max']);
    for (const id of ['max', 'lena']) {
      const t = readTogether(rec(id)!.body)!;
      expect(t.you).toBe(id);
      expect(t.atMs).toBe(NOW);
      expect(t.people.map((p) => [p.name, p.ridesThisWeek, p.minutesThisWeek])).toEqual([['Max', 1, 60], ['Lena', 1, 45]]);
      expect(t.recent.map((r) => r.name)).toEqual(['Lena', 'Max', 'Max']);
      expect(t.recent[0]).toEqual({ name: 'Lena', startedAtMs: NOW, sessionName: 'Grundlage locker', minutes: 45 });
      expect(t.metres).toBe(1350);
      expect(t.peak).toEqual({ name: 'Mont Ventoux', done: 250, total: 1600, next: 'Stilfser Joch' });
      expect(t.summits.map((s) => s.name)).toEqual(['Alpe d’Huez']);
      expect(t.climbing).toHaveLength(2);
      expect(t.people[0]!.weeks).toHaveLength(12);
    }
  });

  it('is written again only when what it says changes', () => {
    run({ states: both() });
    const first = rec('max')!;
    expect(run({ states: both(), now: NOW + 3_600_000 })).toEqual([]);
    expect(rec('max')).toEqual(first);
    const more = [person('max', [ride('m3', 0, 20, NOW + 7_200_000), ride('m1', 1, 60), ride('m2', 9, 30)]), person('lena', [ride('l1', 0, 45)])];
    expect(run({ states: more, now: NOW + 7_200_000 }).sort()).toEqual(['lena', 'max']);
    const second = rec('max')!;
    expect(second.updatedMs).toBeGreaterThan(first.updatedMs);
    expect(readTogether(second.body)!.atMs).toBe(NOW + 7_200_000);
    expect(readTogether(second.body)!.people[0]!.ridesThisWeek).toBe(2);
  });

  it('a new week is a change of its own, so this week never shows last week', () => {
    const quiet = [person('max', []), person('lena', [])];
    run({ states: quiet });
    expect(run({ states: quiet, now: NOW + 7 * DAY }).sort()).toEqual(['lena', 'max']);
    expect(readTogether(rec('max')!.body)!.week).toBeGreaterThan(NOW);
  });

  it('nothing is written while a ride is open', () => {
    expect(run({ states: both(), ride: true })).toEqual([]);
    expect(store.all('max')).toEqual([]);
    expect(store.all('lena')).toEqual([]);
  });

  it('an unlinked profile gets nothing, the linked one still does', () => {
    expect(run({ states: both(), linked: ['lena'] })).toEqual(['lena']);
    expect(store.all('max')).toEqual([]);
    expect(run({ states: both(), linked: [] })).toEqual([]);
  });

  it('no notes, complaints, health, watts, ranking line or streaks cross to the other person', () => {
    run({ states: both() });
    const text = JSON.stringify(rec('lena'));
    expect(text).not.toMatch(/GEHEIM/);
    expect(text).not.toMatch(/power|ftp|Hr|tss|feedback|hard|streak|line|"rides"/i);
    expect(Object.keys(readTogether(rec('lena')!.body)!.people[0]!).sort()).toEqual(['minutesThisWeek', 'name', 'profileId', 'ridesThisWeek', 'weeks', 'wordsLearned']);
  });

  it('a profile alone on the Mac still gets its own part', () => {
    expect(run({ states: [person('max', [ride('m1', 1, 60)])], ids: ['max'], linked: ['max'] })).toEqual(['max']);
    const t = readTogether(rec('max')!.body)!;
    expect(t.people.map((p) => p.name)).toEqual(['Max']);
    expect(t.recent).toHaveLength(1);
  });

  it('a broken store or state is swallowed: the coach goes on', () => {
    const broken = { all: () => { throw new Error('disk'); }, put: () => { throw new Error('disk'); } };
    expect(exportTogether({ store: broken, profileIds: ['max'], nowMs: NOW, linked: () => true, noOpenRide: () => true, together: () => computeTogether(profiles, both(), NOW) })).toEqual([]);
    expect(exportTogether({ store, profileIds: ['max'], nowMs: NOW, linked: () => true, noOpenRide: () => true, together: () => { throw new Error('state'); } })).toEqual([]);
  });
});
