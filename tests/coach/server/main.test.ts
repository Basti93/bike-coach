import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { Household } from '../../../src/coach/server/household';
import { householdOptions, readCoachServerConfig, run, startCoachServer, type CoachServerConfig } from '../../../src/coach/server/main';

const KEY = 'a1'.repeat(32);
const TOKEN = 'f0'.repeat(32);

test('defaults for the container', () => {
  const c = readCoachServerConfig({ PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN });
  expect(c.port).toBe(8090);
  expect(c.root).toBe('/data');
  expect(c.apiUrl).toBe('http://api:8081');
  expect(c.secretKey.equals(Buffer.from(KEY, 'hex'))).toBe(true);
  expect(c.internalToken).toBe(TOKEN);
  expect(c.dry).toBe(false);
  expect(c.claudeBin).toBeUndefined();
});

test('reads every variable', () => {
  const c = readCoachServerConfig({
    PORT: '9000', PANDAFIT_COACH_DATA: '/srv/coach', PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN, PANDAFIT_API_INTERNAL: 'http://api.test:8081',
    BIKE_CLAUDE_BIN: '/usr/bin/claude', PANDAFIT_GARMIN_PYTHON: '/venv/bin/python', PANDAFIT_GARMIN_SCRIPTS: '/scripts', PANDAFIT_COACH_DRY: '1',
  });
  expect(c).toMatchObject({ port: 9000, root: '/srv/coach', apiUrl: 'http://api.test:8081', claudeBin: '/usr/bin/claude', python: '/venv/bin/python', garminScripts: '/scripts', dry: true });
});

test('refuses to start without a valid key or an internal token of 64 hex characters, and never names the value', () => {
  const bad = [
    {}, { PANDAFIT_INTERNAL_TOKEN: TOKEN }, { PANDAFIT_SECRET_KEY: 'zz'.repeat(32), PANDAFIT_INTERNAL_TOKEN: TOKEN },
    { PANDAFIT_SECRET_KEY: KEY }, { PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: 'short-token' }, { PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: `${TOKEN}0` },
    { PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: 'g'.repeat(64) },
  ];
  for (const env of bad) {
    let message = '';
    try { readCoachServerConfig(env); } catch (e) { message = (e as Error).message; }
    expect(message).not.toBe('');
    expect(message).not.toContain(KEY);
    expect(message).not.toContain(TOKEN);
  }
});

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csmain-'));
const config = (over: Partial<CoachServerConfig> = {}): CoachServerConfig => ({
  ...readCoachServerConfig({ PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN, PANDAFIT_COACH_DATA: temp(), PANDAFIT_COACH_DRY: '1' }),
  port: 0, host: '127.0.0.1', ...over,
});

test('dry run: Claude, Garmin and Hevy refuse without touching the network', async () => {
  const o = householdOptions(config());
  await expect(o.ask({ prompt: 'p', systemPrompt: 's', schema: {} })).rejects.toThrow();
  expect(() => (o.spawnFn as unknown as () => void)()).toThrow();
  await expect((o.fetchFn as unknown as () => Promise<unknown>)()).rejects.toThrow();
  // Outside the dry run the real ones are used.
  const real = householdOptions(config({ dry: false }));
  expect(real.spawnFn).toBeUndefined();
  expect(real.fetchFn).toBeUndefined();
});

test('dry run: serves /healthz and never scans', async () => {
  const scan = vi.spyOn(Household.prototype, 'scan');
  try {
    const s = await startCoachServer(config(), { scanMs: 10 });
    const port = (s.app.server.address() as { port: number }).port;
    expect(await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(scan).not.toHaveBeenCalled();
    await s.stop();
    expect(s.app.server.listening).toBe(false);
  } finally { scan.mockRestore(); }
});

test('a normal run scans until it stops', async () => {
  const scan = vi.spyOn(Household.prototype, 'scan').mockImplementation(() => {});
  try {
    const s = await startCoachServer(config({ dry: false }), { scanMs: 10 });
    await vi.waitFor(() => expect(scan.mock.calls.length).toBeGreaterThanOrEqual(2));
    await s.stop();
    const n = scan.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(scan.mock.calls.length).toBe(n);
  } finally { scan.mockRestore(); }
});

test('SIGTERM and SIGINT close the server and exit cleanly; a bad config exits with 1', async () => {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    const handlers = new Map<string, () => void>();
    const exit = vi.fn();
    await run({
      env: { PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN, PANDAFIT_COACH_DATA: temp(), PANDAFIT_COACH_DRY: '1', PORT: '0', HOST: '127.0.0.1' },
      on: (sig, fn) => { handlers.set(sig, fn); }, exit, log: () => {},
    });
    expect([...handlers.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
    handlers.get(signal)!();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
  }
  const exit = vi.fn();
  await run({ env: { PANDAFIT_SECRET_KEY: 'x' }, on: () => {}, exit, log: () => {} });
  expect(exit).toHaveBeenCalledWith(1);
});

const AI_TOKEN = 'c3'.repeat(32);

test('reads the AI service and refuses a URL without a valid token', () => {
  const c = readCoachServerConfig({ PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN, PANDAFIT_AI_URL: 'http://homeserver-ai:8080', PANDAFIT_AI_TOKEN: AI_TOKEN });
  expect(c.aiUrl).toBe('http://homeserver-ai:8080');
  expect(c.aiToken).toBe(AI_TOKEN);
  expect(readCoachServerConfig({ PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN }).aiUrl).toBeUndefined();
  let message = '';
  try { readCoachServerConfig({ PANDAFIT_SECRET_KEY: KEY, PANDAFIT_INTERNAL_TOKEN: TOKEN, PANDAFIT_AI_URL: 'http://homeserver-ai:8080', PANDAFIT_AI_TOKEN: 'short' }); } catch (e) { message = (e as Error).message; }
  expect(message).toContain('PANDAFIT_AI_TOKEN');
  expect(message).not.toContain('short');
});

test('remote_mode_never_spawns_local_claude', async () => {
  const client = await import('../../../src/coach/claude-client');
  const askSpy = vi.spyOn(client, 'askClaude');
  const findSpy = vi.spyOn(client, 'findClaude');
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
  try {
    const o = householdOptions(config({ dry: false, aiUrl: 'http://homeserver-ai:8080', aiToken: AI_TOKEN }));
    await expect(o.ask({ prompt: 'p', systemPrompt: 's', schema: {} })).rejects.toMatchObject({ kind: 'failed' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(askSpy).not.toHaveBeenCalled();
    expect(findSpy).not.toHaveBeenCalled();
  } finally { askSpy.mockRestore(); findSpy.mockRestore(); fetchSpy.mockRestore(); }
});

test('no_url_keeps_local_claude', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    const o = householdOptions(config({ dry: false, claudeBin: '/nonexistent/claude' }));
    await expect(o.ask({ prompt: 'p', systemPrompt: 's', schema: {} })).rejects.toMatchObject({ kind: 'missing' });
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
