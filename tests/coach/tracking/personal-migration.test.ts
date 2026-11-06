import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Coach } from '../../../src/coach/coach';
import { saveGymState } from '../../../src/coach/gym/state';
import { GymCoach } from '../../../src/coach/gym/gym-coach';
import { RecordStore } from '../../../src/coach/tracking/store';
import { migrateRules } from '../../../src/coach/tracking/personal';
import { moveRule, wishes } from '../../../src/shared/personal';

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migr-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const NOW = Date.UTC(2026, 10, 7, 12);
const rules = (atMs = 1) => [{ atMs, text: 'Immer zuerst aufwärmen' }, { atMs: atMs + 1, text: 'Kurze Einheiten bevorzugen' }];

describe('migration of the old free-text rules', () => {
  it('gym: texts become active migrated wishes once, a rerun adds nothing, the old field is gone', () => {
    const dir = path.join(tmp, 'gym');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'p1.json');
    fs.writeFileSync(file, JSON.stringify({ profileId: 'p1', goal: 'muscle', rules: rules() }));
    const store = new RecordStore({ dir: path.join(tmp, 'tracking') });
    const deps = { dir, nowMs: () => NOW, store, ask: async () => ({}), workouts: () => [], templates: async () => [], ready: () => true, refreshTemplates: async () => [], bike: () => ({ summaries: [], complaints: [] }), complaint: () => {}, writer: () => null };
    const first = new GymCoach(deps as never);
    expect('rules' in first.state('p1')).toBe(false);
    const recs = store.all('p1', 'rule');
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => (r.body as { source: string; state: string; kind: string }).source === 'migrated' && (r.body as { state: string }).state === 'active' && (r.body as { kind: string }).kind === 'wish')).toBe(true);
    expect(wishes(recs, 'gym').sort()).toEqual(['Immer zuerst aufwärmen', 'Kurze Einheiten bevorzugen']);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).rules).toBeUndefined();
    // A second coach (restart) and a state file that still has the rules (crash before the rewrite) add nothing.
    fs.writeFileSync(file, JSON.stringify({ profileId: 'p1', rules: rules() }));
    const second = new GymCoach(deps as never);
    second.state('p1');
    expect(store.all('p1', 'rule')).toHaveLength(2);
  });

  it('gym: without a store, or while the migration fails, the file keeps the rules through every save', () => {
    const dir = path.join(tmp, 'gym');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'p1.json');
    fs.writeFileSync(file, JSON.stringify({ profileId: 'p1', rules: rules() }));
    const failing = { all: () => [], put: () => { throw new Error('disk'); } };
    const base = { dir, nowMs: () => NOW, ask: async () => ({}), workouts: () => [], templates: async () => [], ready: () => true, refreshTemplates: async () => [], bike: () => ({ summaries: [], complaints: [] }), complaint: () => {}, writer: () => null };
    for (const store of [undefined, failing]) {
      const c = new GymCoach({ ...base, store } as never);
      saveGymState(dir, c.state('p1'));
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).rules).toHaveLength(2);
    }
  });

  it('migrated records are stamped 1, so a person edit on another Mac wins', () => {
    const store = new RecordStore({ dir: path.join(tmp, 'tracking') });
    migrateRules(store, 'p1', 'gym', ['Text eins'], NOW);
    const [a] = store.all('p1', 'rule');
    expect(a!.updatedMs).toBe(1);
    expect(moveRule(a!, 'paused', NOW)!.updatedMs).toBe(NOW);
  });

  it('a migrated wish the person paused or deleted does not come back', () => {
    const store = new RecordStore({ dir: path.join(tmp, 'tracking') });
    migrateRules(store, 'p1', 'gym', ['Text eins', 'Text zwei'], NOW);
    const [a, b] = store.all('p1', 'rule');
    store.put('p1', moveRule(a!, 'paused', NOW + 5)!);
    store.put('p1', { ...b!, deleted: true, updatedMs: NOW + 5 });
    expect(migrateRules(store, 'p1', 'gym', ['Text eins', 'Text zwei'], NOW + 9)).toBe(0);
    expect(store.all('p1', 'rule')).toHaveLength(2);
  });

  it('bike: texts become wishes for bike, the old field is gone from state and file', () => {
    const rides = path.join(tmp, 'rides');
    const coachDir = path.join(tmp, 'coach');
    fs.mkdirSync(rides, { recursive: true });
    const store = new RecordStore({ dir: path.join(tmp, 'tracking') });
    const make = () => new Coach({ ridesDir: rides, coachDir, ask: async () => ({}), nowMs: () => NOW, store });
    const c = make();
    c.scanRides([{ id: 'pa', name: 'Max', ftpW: 200 } as never]);
    // Simulate an older state file that still holds rules.
    const f = path.join(coachDir, `${encodeURIComponent('pa')}.json`);
    const withRules = { ...JSON.parse(fs.readFileSync(f, 'utf8')), rules: rules() };
    fs.writeFileSync(f, JSON.stringify(withRules));
    const c2 = make();
    c2.scanRides([{ id: 'pa', name: 'Max', ftpW: 200 } as never]);
    expect(wishes(store.all('pa', 'rule'), 'bike').sort()).toEqual(['Immer zuerst aufwärmen', 'Kurze Einheiten bevorzugen']);
    expect('rules' in c2.state('pa')).toBe(false);
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).rules).toBeUndefined();
    const c3 = make();
    c3.scanRides([{ id: 'pa', name: 'Max', ftpW: 200 } as never]);
    expect(store.all('pa', 'rule')).toHaveLength(2);
  });

  it('gym: a legacy rule that equals a complaint text is not made a wish', () => {
    const dir = path.join(tmp, 'gym2');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'p1.json'), JSON.stringify({ profileId: 'p1', goal: 'muscle', rules: rules() }));
    const store = new RecordStore({ dir: path.join(tmp, 'tracking2') });
    store.put('p1', { kind: 'complaint', id: 'c1', updatedMs: 1, deleted: false, body: { text: '  immer ZUERST  aufwärmen', status: 'open', atMs: 1 } } as never);
    const deps = { dir, nowMs: () => NOW, store, ask: async () => ({}), workouts: () => [], templates: async () => [], ready: () => true, refreshTemplates: async () => [], bike: () => ({ summaries: [], complaints: [] }), complaint: () => {}, writer: () => null };
    new GymCoach(deps as never).state('p1');
    expect(wishes(store.all('p1', 'rule'), 'gym')).toEqual(['Kurze Einheiten bevorzugen']);
  });
});
