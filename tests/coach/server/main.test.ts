import { readCoachServerConfig } from '../../../src/coach/server/main';

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
