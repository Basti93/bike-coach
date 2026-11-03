import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { createCoachRuntime, type RuntimeOptions } from '../../src/coach/runtime';
import { AccountLinks } from '../../src/coach/tracking/link';
import { rampTest } from '../../src/coach/rules';
import type { Profile } from '../../src/shared/profiles';
import type { CoachServerMessage } from '../../src/shared/coach-protocol';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
const good = { id: 'ki', name: 'KI', steps: [
  { kind: 'erg', durationS: 300, ftpFraction: 0.5, label: 'Warmup' },
  { kind: 'erg', durationS: 1200, ftpFraction: 0.65, label: 'Locker' },
] };
const answer = { phase: { name: 'Aufbau', weeksLeft: 3, goal: 'x' }, ftpForecast: [], session: good, reason: 'Von KI', change: 'neu' };
const PROFILES: Profile[] = [{ id: 'pa', name: 'A', ftpW: 200 } as Profile];

const seed = (root: string) => {
  const rides = path.join(root, 'rides');
  fs.mkdirSync(path.join(rides, 'ride-1000'), { recursive: true });
  fs.writeFileSync(path.join(rides, 'profiles.json'), JSON.stringify(PROFILES));
  const s = rampTest(200);
  fs.writeFileSync(path.join(rides, 'ride-1000', 'meta.json'), JSON.stringify({ rideId: 'ride-1000', profileId: 'pa', sessionId: s.id, startedAtMs: Date.now() - 3600_000, status: 'finished' }));
  fs.writeFileSync(path.join(rides, 'ride-1000', 'session.json'), JSON.stringify({ session: s, ftpW: 200 }));
  fs.writeFileSync(path.join(rides, 'ride-1000', 'samples.jsonl'), Array.from({ length: 600 }, (_, i) => JSON.stringify({ seq: i, wallClockMs: i, rideElapsedS: i + 1, powerW: 260, cadenceRpm: 90, speedKph: 30, hrBpm: 150, targetW: 260, gradePct: null, gear: null })).join('\n') + '\n');
  return rides;
};
/** A Hevy key and Garmin tokens, so a tick would start a Hevy request and a Garmin run. */
const connectHevyAndGarmin = (root: string) => {
  fs.mkdirSync(path.join(root, 'hevy', 'pa'), { recursive: true });
  fs.writeFileSync(path.join(root, 'hevy', 'pa', 'api-key'), '00000000-0000-0000-0000-000000000000');
  fs.mkdirSync(path.join(root, 'garmin', 'tokens', 'pa'), { recursive: true });
  fs.writeFileSync(path.join(root, 'garmin', 'tokens', 'pa', 'garmin_tokens.json'), '{}');
};

const make = (over: Partial<RuntimeOptions> = {}) => {
  const root = temp(); seed(root);
  const ask = vi.fn(async () => answer);
  const spawnFn = vi.fn(() => { throw new Error('no python in tests'); });
  const fetchFn = vi.fn(async () => new Response('', { status: 401 }));
  const runtime = createCoachRuntime({
    root, profiles: () => PROFILES, noOpenRide: () => true, ask,
    python: process.execPath, garminScripts: path.join(root, 'scripts'),
    links: new AccountLinks({ dir: path.join(root, 'accounts') }),
    meals: 'own', together: () => ({ summits: [] }) as never,
    spawnFn: spawnFn as never, fetchFn: fetchFn as never, waitMs: 0,
    ...over,
  });
  return { root, runtime, ask, spawnFn, fetchFn };
};
const settle = () => new Promise((r) => setTimeout(r, 50));
const subscribe = (runtime: ReturnType<typeof make>['runtime'], profileId = 'pa') => {
  const replies: CoachServerMessage[] = [];
  runtime.handle({ type: 'subscribe', profileId }, (m) => replies.push(m));
  return replies;
};

test('subscribe answers with the coach-state keys main.ts sent before', () => {
  const { runtime } = make();
  const replies = subscribe(runtime);
  const state = replies.find((m) => m.type === 'coach-state');
  expect(Object.keys(state!)).toEqual(['type', 'state', 'thinking', 'hevy', 'debriefing', 'together', 'garmin', 'garminSync', 'garminReadiness', 'garminSuggestion', 'gym', 'strengthHealth', 'mobility', 'account', 'meals']);
  expect(runtime.view('pa')).toEqual(state);
});

test('a profile outside profiles() gets no view and its messages change nothing', () => {
  const { root, runtime } = make();
  subscribe(runtime);
  expect(runtime.view('x')).toBeNull();
  const replies: CoachServerMessage[] = [];
  runtime.handle({ type: 'note', profileId: 'x', text: 'a' }, (m) => replies.push(m));
  runtime.handle({ type: 'subscribe', profileId: 'x' }, (m) => replies.push(m));
  expect(fs.existsSync(path.join(root, 'coach', 'x.json'))).toBe(false);
  expect(replies).toEqual([]);
  expect(runtime.profileIds()).toEqual(['pa']);
  expect(runtime.coachState('pa')?.profileId).toBe('pa');
});

test('scan with scheduled() false asks no Claude and starts no Hevy or Garmin run', async () => {
  for (const over of [{ scheduled: () => false }, { noOpenRide: () => false }]) {
    const { root, runtime, ask, spawnFn, fetchFn } = make(over);
    connectHevyAndGarmin(root);
    runtime.scan();
    await settle();
    runtime.scan();
    await settle();
    expect(ask).not.toHaveBeenCalled();
    expect(spawnFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  }
});

test('heavyBusy() true skips the Hevy and Garmin ticks but not planning', async () => {
  const busy = make({ heavyBusy: () => true });
  connectHevyAndGarmin(busy.root);
  busy.runtime.scan();
  await settle();
  expect(busy.ask).toHaveBeenCalled();
  expect(busy.spawnFn).not.toHaveBeenCalled();
  expect(busy.fetchFn).not.toHaveBeenCalled();

  const free = make({ heavyBusy: () => false });
  connectHevyAndGarmin(free.root);
  free.runtime.scan();
  await settle();
  expect(free.spawnFn).toHaveBeenCalled();
  expect(free.fetchFn).toHaveBeenCalled();
});

test('meals null: meals messages are ignored and the view has meals null', () => {
  const { root, runtime } = make({ meals: null });
  subscribe(runtime);
  runtime.handle({ type: 'meals-settings', profileId: 'pa', settings: { enabled: true } } as never, () => {});
  expect(runtime.view('pa')?.meals).toBeNull();
  expect(fs.existsSync(path.join(root, 'coach', 'meals'))).toBe(false);
});

test('onChange tells about a change and stops after unsubscribing', () => {
  const { runtime } = make();
  const seen: (string | null)[] = [];
  const off = runtime.onChange((id) => seen.push(id));
  subscribe(runtime);
  expect(seen.length).toBeGreaterThan(0);
  off();
  const n = seen.length;
  subscribe(runtime);
  expect(seen.length).toBe(n);
});
