import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HevyLinks, HevySync } from '../../src/coach/hevy';
import { PLAIN_CODEC, sealedCodec, type SecretCodec } from '../../src/coach/secrets/secret-box';

const NOW = 1_800_000_000_000;
const raw = (id: string, day = 1, over: object = {}) => ({
  id, title: `Einheit ${id}`, start_time: `2027-01-0${day}T10:00:00+00:00`, end_time: `2027-01-0${day}T10:30:00+00:00`,
  exercises: [{ exercise_template_id: 'T1', title: 'Kniebeuge', sets: [
    { type: 'warmup', weight_kg: 20, reps: 10 },
    { type: 'normal', weight_kg: 50, reps: 10 },
    { type: 'normal', weight_kg: null, reps: 5 },
  ] }], ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let dir: string; let now: number;
beforeEach(() => { pauses.length = 0; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hevy-')); now = NOW; });
const pauses: number[] = [];
const sleep = async (ms: number) => { pauses.push(ms); };
const make = (fetchFn: typeof fetch) => new HevySync({ key: 'test-key', dir, nowMs: () => now, fetchFn, sleep });
const pages = (count: number) => vi.fn(async (url: string | URL | Request) => {
  const page = Number(new URL(String(url)).searchParams.get('page'));
  return json({ page, page_count: count, workouts: [raw(`w${page}`)] });
}) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const onePage = () => { let n = 0; return () => n++ === 0; };
test('a workout is reduced to what the coach needs, warmup sets left out of the volume', async () => {
  const sync = make(pages(1));
  await sync.tick();
  expect(sync.workouts()[0]).toEqual({
    id: 'w1', title: 'Einheit w1', startMs: Date.parse('2027-01-01T10:00:00Z'), durationS: 1800,
    exercises: [{ title: 'Kniebeuge', templateId: 'T1', sets: 2, reps: 15, volumeKg: 500, workSets: [
      { type: 'warmup', weightKg: 20, reps: 10 }, { type: 'normal', weightKg: 50, reps: 10 }, { type: 'normal', weightKg: null, reps: 5 },
    ] }],
  });
});
test('exercises carry template id and all sets', async () => {
  const sync = make(pages(1));
  await sync.tick();
  const e = sync.workouts()[0].exercises[0];
  expect(e.templateId).toBe('T1');
  expect(e.workSets.map((x) => x.type)).toEqual(['warmup', 'normal', 'normal']);
});
const oldStore = () => fs.writeFileSync(path.join(dir, 'workouts.json'), JSON.stringify({
  workouts: { old: { id: 'old', title: 'Alt', startMs: 1, durationS: 60, exercises: [] } }, nextPage: null, syncFromMs: NOW - 1000, lastTryMs: NOW,
}));
test('a store without a format version refetches from page 1 and keeps the old workouts meanwhile', async () => {
  oldStore();
  const f = pages(2);
  const sync = make(f);
  expect(sync.workouts().map((w) => w.id)).toEqual(['old']);
  expect(sync.status().loading).toBe(true);
  await sync.tick(onePage());
  expect(new URL(String(f.mock.calls[0][0])).searchParams.get('page')).toBe('1');
  expect(sync.workouts().map((w) => w.id).sort()).toEqual(['old', 'w1']);
});
test('ready is false during the refetch and true after', async () => {
  oldStore();
  const sync = make(pages(2));
  expect(sync.ready()).toBe(false);
  await sync.tick(onePage());
  expect(sync.ready()).toBe(false);
  await sync.tick(onePage());
  expect(sync.ready()).toBe(true);
  expect(make(pages(2)).ready()).toBe(true);
});
test('the refetch does not tell the bike coach anything changed until it ends', async () => {
  oldStore();
  const sync = make(pages(3));
  expect(await sync.tick(onePage())).toBe(false);
  expect(await sync.tick(onePage())).toBe(false);
  expect(await sync.tick(onePage())).toBe(true);
});
test('sends the key as a header and only ever reads', async () => {
  const f = pages(1);
  await make(f).tick();
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).not.toContain('test-key');
  expect((init.headers as Record<string, string>)['api-key']).toBe('test-key');
  expect(init.method ?? 'GET').toBe('GET');
});
test('the first run fetches page by page and resumes after a restart', async () => {
  const f = pages(3);
  const first = make(f);
  expect(await first.tick(onePage())).toBe(false);
  expect(f).toHaveBeenCalledTimes(1);
  const second = make(f);
  expect(second.workouts().map((w) => w.id)).toEqual(['w1']);
  expect(await second.tick(onePage())).toBe(false);
  expect(await second.tick(onePage())).toBe(true);
  expect(f).toHaveBeenCalledTimes(3);
  expect(new URL(String(f.mock.calls[1][0])).searchParams.get('page')).toBe('2');
  expect(second.workouts()).toHaveLength(3);
});
const pageOf = (f: { mock: { calls: unknown[][] } }, i: number) => new URL(String(f.mock.calls[i][0])).searchParams.get('page');
test('one tick fetches several pages one after another with a pause between', async () => {
  let open = 0; let overlap = false;
  const f = vi.fn(async (url: string | URL | Request) => {
    open++; overlap ||= open > 1; await Promise.resolve(); open--;
    const page = Number(new URL(String(url)).searchParams.get('page'));
    return json({ page, page_count: 3, workouts: [raw(`w${page}`)] });
  });
  const sync = make(f as never);
  expect(await sync.tick()).toBe(true);
  expect(f.mock.calls.map((_, i) => pageOf(f, i))).toEqual(['1', '2', '3']);
  expect(pauses).toEqual([1000, 1000]);
  expect(overlap).toBe(false);
  expect(sync.ready()).toBe(true);
});
test('a tick fetches at most 8 pages, the next tick carries on', async () => {
  const f = pages(20);
  const sync = make(f);
  expect(await sync.tick()).toBe(false);
  expect(f).toHaveBeenCalledTimes(8);
  expect(await sync.tick()).toBe(false);
  expect(f).toHaveBeenCalledTimes(16);
  expect(pageOf(f, 8)).toBe('9');
});
test('every page is saved, so a restart resumes at the next one', async () => {
  let saved = -1;
  const f = vi.fn(async (url: string | URL | Request) => {
    const page = Number(new URL(String(url)).searchParams.get('page'));
    if (page === 3) saved = make(pages(5)).workouts().length;
    return json({ page, page_count: 5, workouts: [raw(`w${page}`)] });
  });
  await make(f as never).tick();
  expect(saved).toBe(2);
});
test('the loop stops before the next page when the check turns false', async () => {
  const check = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
  const f = pages(20);
  const sync = make(f);
  await sync.tick(check);
  expect(f).toHaveBeenCalledTimes(2);
  expect(sync.status().workouts).toBe(2);
});
test('a second tick during a run asks for nothing', async () => {
  const f = pages(20);
  const sync = make(f);
  const first = sync.tick();
  expect(await sync.tick()).toBe(false);
  await first;
  expect(f).toHaveBeenCalledTimes(8);
});
test('a 429 on page 2 stops the run, page 1 stays saved, and the retry waits', async () => {
  const f = vi.fn(async (url: string | URL | Request) => {
    const page = Number(new URL(String(url)).searchParams.get('page'));
    return page === 2 ? json({}, 429) : json({ page, page_count: 5, workouts: [raw(`w${page}`)] });
  });
  const sync = make(f as never);
  expect(await sync.tick()).toBe(false);
  expect(f).toHaveBeenCalledTimes(2);
  expect(make(f as never).workouts().map((w) => w.id)).toEqual(['w1']);
  await sync.tick();
  expect(f).toHaveBeenCalledTimes(2);
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

test('reports its state without the key', async () => {
  const sync = make(pages(2));
  await sync.tick(onePage());
  expect(sync.status()).toEqual({ workouts: 1, loading: true, lastSyncMs: NOW, rejected: false });
  await sync.tick(onePage());
  expect(sync.status()).toMatchObject({ workouts: 2, loading: false });
});
test('a closed sync writes nothing any more', async () => {
  let release = (_: Response) => {};
  const sync = make((() => new Promise<Response>((r) => { release = r; })) as never);
  const run = sync.tick();
  sync.close();
  fs.rmSync(dir, { recursive: true, force: true });
  release(json({ page: 1, page_count: 1, workouts: [raw('w1')] }));
  await run;
  expect(fs.existsSync(dir)).toBe(false);
});

const KEY = '11111111-2222-3333-4444-555555555555';
describe('connection per profile', () => {
  const ok = () => vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/v1/user/info')) return json({ data: { name: 'Test' } });
    return json({ page: 1, page_count: 1, workouts: [raw('w1')] });
  });
  const links = (fetchFn: unknown, onChange = vi.fn()) => new HevyLinks({ baseDir: dir, nowMs: () => now, fetchFn: fetchFn as typeof fetch, sleep, onChange });
  const keyFile = (id: string) => path.join(dir, id, 'api-key');

  test('without a key nothing happens and nothing is asked', async () => {
    const f = ok();
    const l = links(f);
    await l.tick(['pa']);
    expect(l.status('pa')).toEqual({ state: 'idle' });
    expect(l.workouts('pa')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
  test('a good key is checked, stored privately and starts the sync', async () => {
    const onChange = vi.fn();
    const l = links(ok(), onChange);
    await l.connect('pa', ` ${KEY} `);
    expect(fs.readFileSync(keyFile('pa'), 'utf8')).toBe(KEY);
    expect(fs.statSync(keyFile('pa')).mode & 0o777).toBe(0o600);
    expect(l.status('pa').state).toBe('connected');
    await l.tick(['pa']);
    expect(l.workouts('pa')).toHaveLength(1);
    expect(onChange).toHaveBeenCalledWith('pa');
  });
  test('the connection survives a restart', async () => {
    await links(ok()).connect('pa', KEY);
    expect(links(ok()).status('pa').state).toBe('connected');
  });
  test('every profile has its own key and data', async () => {
    const l = links(ok());
    await l.connect('pa', KEY);
    await l.tick(['pa', 'pb']);
    expect(l.workouts('pa')).toHaveLength(1);
    expect(l.workouts('pb')).toEqual([]);
    expect(l.status('pb')).toEqual({ state: 'idle' });
  });
  test('a rejected key is not stored and says so', async () => {
    const l = links(vi.fn(async () => json({}, 401)));
    await l.connect('pa', KEY);
    expect(fs.existsSync(keyFile('pa'))).toBe(false);
    expect(l.status('pa')).toEqual({ state: 'failed', reason: 'invalid' });
  });
  test('something that is no key is not even sent', async () => {
    const f = ok();
    const l = links(f);
    await l.connect('pa', 'quatsch');
    expect(f).not.toHaveBeenCalled();
    expect(l.status('pa')).toEqual({ state: 'failed', reason: 'invalid' });
  });
  test('Hevy being away is not the fault of the key', async () => {
    const l = links(vi.fn(async () => { throw new Error('weg'); }));
    await l.connect('pa', KEY);
    expect(l.status('pa')).toEqual({ state: 'failed', reason: 'failed' });
  });
  test('shows that it is connecting', async () => {
    let release = (_: Response) => {};
    const l = links(() => new Promise<Response>((r) => { release = r; }));
    const run = l.connect('pa', KEY);
    expect(l.status('pa')).toEqual({ state: 'connecting' });
    release(json({ data: {} }));
    await run;
  });
  test('a key revoked later asks to connect again', async () => {
    await links(ok()).connect('pa', KEY);
    const l = links(vi.fn(async () => json({}, 401)));
    await l.tick(['pa']);
    expect(l.status('pa')).toEqual({ state: 'failed', reason: 'expired' });
  });
  test('disconnecting removes key and data, and the coach forgets', async () => {
    const onChange = vi.fn();
    const l = links(ok(), onChange);
    await l.connect('pa', KEY);
    await l.tick(['pa']);
    onChange.mockClear();
    l.disconnect('pa');
    expect(fs.existsSync(path.join(dir, 'pa'))).toBe(false);
    expect(l.workouts('pa')).toEqual([]);
    expect(l.status('pa')).toEqual({ state: 'idle' });
    expect(onChange).toHaveBeenCalledWith('pa');
  });
  test('an unsafe profile id touches nothing', async () => {
    const f = ok();
    const l = links(f);
    await l.connect('../x', KEY);
    l.disconnect('../..');
    expect(f).not.toHaveBeenCalled();
    expect(fs.existsSync(dir)).toBe(true);
    expect(l.status('../x')).toEqual({ state: 'idle' });
  });
  test('the status never carries the key', async () => {
    const l = links(ok());
    await l.connect('pa', KEY);
    expect(JSON.stringify(l.status('pa'))).not.toContain(KEY);
  });
});

describe('sealed key', () => {
  const SECRET = Buffer.alloc(32, 3);
  const ok = () => vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/v1/user/info')) return json({ data: { name: 'Test' } });
    if ((init?.headers as Record<string, string>)['api-key'] !== KEY) return json({}, 401);
    return json({ page: 1, page_count: 1, workouts: [raw('w1')] });
  });
  const links = (fetchFn: unknown, codec?: SecretCodec | ((id: string) => SecretCodec)) => new HevyLinks({ baseDir: dir, nowMs: () => now, fetchFn: fetchFn as typeof fetch, sleep, onChange: vi.fn(), ...(codec ? { codec } : {}) });
  const keyFile = (id: string) => path.join(dir, id, 'api-key');

  test('Hevy with a sealed codec: api-key on disk starts with pfs1., apiKey() returns the key, status() never contains it', async () => {
    const codec = sealedCodec(SECRET, 'acc1:hevy');
    const l = links(ok(), codec);
    await l.connect('pa', KEY);
    const stored = fs.readFileSync(keyFile('pa'), 'utf8');
    expect(stored.startsWith('pfs1.')).toBe(true);
    expect(stored).not.toContain(KEY);
    expect(fs.statSync(keyFile('pa')).mode & 0o777).toBe(0o600);
    expect(l.apiKey('pa')).toBe(KEY);
    expect(l.status('pa').state).toBe('connected');
    await l.tick(['pa']);
    expect(l.workouts('pa')).toHaveLength(1);
    expect(JSON.stringify(l.status('pa'))).not.toContain(KEY);
    // A fresh start reads the sealed key again.
    expect(links(ok(), codec).apiKey('pa')).toBe(KEY);
    // Per profile codecs work as well.
    expect(links(ok(), () => codec).apiKey('pa')).toBe(KEY);
  });
  test('a sealed key that does not open counts as no key, and nothing is sent', async () => {
    await links(ok(), sealedCodec(SECRET, 'acc1:hevy')).connect('pa', KEY);
    const f = ok();
    const other = links(f, sealedCodec(SECRET, 'acc2:hevy'));
    expect(other.apiKey('pa')).toBeNull();
    expect(other.status('pa')).toEqual({ state: 'idle' });
    await other.tick(['pa']);
    expect(f).not.toHaveBeenCalled();
  });
  test('Hevy without a codec writes the key in plain as today', async () => {
    const l = links(ok());
    await l.connect('pa', KEY);
    expect(fs.readFileSync(keyFile('pa'), 'utf8')).toBe(KEY);
    expect(l.apiKey('pa')).toBe(KEY);
    expect(links(ok(), PLAIN_CODEC).apiKey('pa')).toBe(KEY);
  });
});
