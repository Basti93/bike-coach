import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HevySync, readHevyConfig } from '../../src/coach/hevy';

const NOW = 1_800_000_000_000;
const raw = (id: string, day = 1, over: object = {}) => ({
  id, title: `Einheit ${id}`, start_time: `2027-01-0${day}T10:00:00+00:00`, end_time: `2027-01-0${day}T10:30:00+00:00`,
  exercises: [{ title: 'Kniebeuge', sets: [
    { type: 'warmup', weight_kg: 20, reps: 10 },
    { type: 'normal', weight_kg: 50, reps: 10 },
    { type: 'normal', weight_kg: null, reps: 5 },
  ] }], ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let dir: string; let now: number;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hevy-')); now = NOW; });
const make = (fetchFn: typeof fetch) => new HevySync({ key: 'test-key', dir, nowMs: () => now, fetchFn });
const pages = (count: number) => vi.fn(async (url: string | URL | Request) => {
  const page = Number(new URL(String(url)).searchParams.get('page'));
  return json({ page, page_count: count, workouts: [raw(`w${page}`)] });
}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

test('a workout is reduced to what the coach needs, warmup sets left out of the volume', async () => {
  const sync = make(pages(1));
  await sync.tick();
  expect(sync.workouts()[0]).toEqual({
    id: 'w1', title: 'Einheit w1', startMs: Date.parse('2027-01-01T10:00:00Z'), durationS: 1800,
    exercises: [{ title: 'Kniebeuge', sets: 2, reps: 15, volumeKg: 500 }],
  });
});
test('sends the key as a header and only ever reads', async () => {
  const f = pages(1);
  await make(f).tick();
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).not.toContain('test-key');
  expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
  expect(init.method ?? 'GET').toBe('GET');
});
test('the first run fetches one page per tick and resumes after a restart', async () => {
  const f = pages(3);
  const first = make(f);
  expect(await first.tick()).toBe(false);
  expect(f).toHaveBeenCalledTimes(1);
  const second = make(f);
  expect(second.workouts().map((w) => w.id)).toEqual(['w1']);
  expect(await second.tick()).toBe(false);
  expect(await second.tick()).toBe(true);
  expect(f).toHaveBeenCalledTimes(3);
  expect(new URL(String(f.mock.calls[1][0])).searchParams.get('page')).toBe('2');
  expect(second.workouts()).toHaveLength(3);
});
test('after the first run only changes are fetched, and rarely', async () => {
  const f = pages(1);
  const sync = make(f);
  await sync.tick();
  await sync.tick();
  expect(f).toHaveBeenCalledTimes(1);
  now += 30 * 60_000;
  const events = vi.fn(async () => json({ page: 1, page_count: 1, events: [{ type: 'updated', workout: raw('w1', 1, { title: 'Neu' }) }, { type: 'updated', workout: raw('w2', 2) }, { type: 'deleted', id: 'gibtsnicht' }] }));
  const later = make(events as never);
  expect(await later.tick()).toBe(true);
  expect(String(events.mock.calls[0])).toContain('/v1/workouts/events');
  expect(new URL(String((events.mock.calls[0] as unknown[])[0])).searchParams.get('since')).toBe(new Date(NOW).toISOString());
  expect(later.workouts().map((w) => w.title).sort()).toEqual(['Einheit w2', 'Neu']);
});
test('a workout deleted in Hevy goes away here too', async () => {
  await make(pages(1)).tick();
  now += 30 * 60_000;
  const later = make((async () => json({ page: 1, page_count: 1, events: [{ type: 'deleted', id: 'w1' }] })) as never);
  await later.tick();
  expect(later.workouts()).toEqual([]);
});
test('no changes means nothing new for the coach', async () => {
  await make(pages(1)).tick();
  now += 30 * 60_000;
  const later = make((async () => json({ page: 1, page_count: 0, events: [] })) as never);
  expect(await later.tick()).toBe(false);
});
test('a rejected key stops further calls and keeps the data', async () => {
  await make(pages(1)).tick();
  now += 30 * 60_000;
  const f = vi.fn(async () => json({}, 401));
  const later = make(f as never);
  await later.tick();
  now += 24 * 3600_000;
  await later.tick();
  expect(f).toHaveBeenCalledTimes(1);
  expect(later.workouts()).toHaveLength(1);
});
test('a network error keeps the data and tries again later', async () => {
  await make(pages(1)).tick();
  now += 30 * 60_000;
  const f = vi.fn(async () => { throw new Error('weg'); });
  const later = make(f as never);
  expect(await later.tick()).toBe(false);
  await later.tick();
  expect(f).toHaveBeenCalledTimes(1);
  now += 30 * 60_000;
  await later.tick();
  expect(f).toHaveBeenCalledTimes(2);
  expect(later.workouts()).toHaveLength(1);
});
test('a broken file starts over without throwing', async () => {
  fs.writeFileSync(path.join(dir, 'workouts.json'), '{kaputt');
  const sync = make(pages(1));
  expect(sync.workouts()).toEqual([]);
  await sync.tick();
  expect(sync.workouts()).toHaveLength(1);
});
test('the key is never stored', async () => {
  await make(pages(1)).tick();
  expect(fs.readFileSync(path.join(dir, 'workouts.json'), 'utf8')).not.toContain('test-key');
});

describe('configuration', () => {
  const files = (env: string | null, config: object | null) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    if (env !== null) fs.writeFileSync(path.join(d, '.env'), env);
    if (config) fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(config));
    return { envFile: path.join(d, '.env'), configFile: path.join(d, 'config.json') };
  };
  test('no key means no Hevy, without an error', () => {
    expect(readHevyConfig(files(null, null), {})).toBeNull();
    expect(readHevyConfig(files('HEVY_API_KEY=\nHEVY_PROFILE_ID=\n', { syncUrl: 'x' }), {})).toBeNull();
  });
  test('a key without a profile is not used, it belongs to one person', () => {
    expect(readHevyConfig(files('HEVY_API_KEY=abc\n', null), {})).toBeNull();
  });
  test('reads the .env file', () => {
    expect(readHevyConfig(files('# x\nHEVY_API_KEY=abc\nHEVY_PROFILE_ID=p1\n', null), {})).toEqual({ key: 'abc', profileId: 'p1' });
  });
  test('the environment wins', () => {
    expect(readHevyConfig(files('HEVY_API_KEY=abc\nHEVY_PROFILE_ID=p1\n', null), { HEVY_API_KEY: 'env', HEVY_PROFILE_ID: 'p2' })).toEqual({ key: 'env', profileId: 'p2' });
  });
  test('the packaged app reads config.json', () => {
    expect(readHevyConfig(files(null, { hevyApiKey: 'abc', hevyProfileId: 'p1' }), {})).toEqual({ key: 'abc', profileId: 'p1' });
  });
  test('an unsafe profile id is refused', () => {
    expect(readHevyConfig(files('HEVY_API_KEY=abc\nHEVY_PROFILE_ID=../x\n', null), {})).toBeNull();
  });
});
