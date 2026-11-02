import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const files = ['Dockerfile', 'Dockerfile.dockerignore', 'compose.yaml', 'serve.json', '.env.example', 'backup.sh', 'restore-drill.sh', 'mac/install-pull.sh', 'mac/pull-backups.sh', 'README.md'].map((f) => `web-server/${f}`);

test('the sync compose still has no Funnel and the new one has its own node', () => {
  expect(JSON.parse(read('server/serve.json')).AllowFunnel['${TS_CERT_DOMAIN}:443']).toBe(false);
  const serve = JSON.parse(read('web-server/serve.json'));
  expect(serve.AllowFunnel['${TS_CERT_DOMAIN}:443']).toBe(true);
  expect(serve.Web['${TS_CERT_DOMAIN}:443'].Handlers['/'].Proxy).toBe('http://api:8080');
  const c = read('web-server/compose.yaml');
  expect(c).toMatch(/^name: pandafit$/m);
  expect(c).toMatch(/hostname: pandafit$/m);
  expect(c).toContain('tailscale/tailscale:v1.76.1');
  expect(c).toContain('TS_USERSPACE: "true"');
  expect(c).toContain('name: pandafit_data');
  expect(c).not.toMatch(/^\s+env_file:/m);
});

test('no secret or host name appears in the deploy files', () => {
  for (const f of files) {
    const t = read(f);
    expect(t, f).not.toMatch(/tskey-\w/);
    expect(t, f).not.toMatch(/(?<!<tailnet>\.)\b[\w-]+\.ts\.net/);
    expect(t, f).not.toMatch(/\S+@(gmail|googlemail|icloud|gmx|web)\./i);
    expect(t, f).not.toMatch(/\b(?!127\.0\.0\.1\b|172\.(16|18)\.0\.0\b|0\.0\.0\.0\b)\d{1,3}(\.\d{1,3}){3}\b/);
  }
  expect(read('web-server/.env.example')).toMatch(/^TS_AUTHKEY=$/m);
  expect(read('web-server/.env.example')).toMatch(/^PANDAFIT_PORT=$/m);
});

test('the API container has read_only, no capabilities and only a localhost port', () => {
  const api = read('web-server/compose.yaml').split(/^  tailscale:/m)[0]!;
  expect(api).toMatch(/read_only: true/);
  expect(api).toMatch(/cap_drop: \[ALL\]/);
  expect(api).toContain('no-new-privileges:true');
  expect(api).toContain('mem_limit: 256m');
  expect(api).toContain('stop_grace_period: 15s');
  expect(api).toMatch(/- \/tmp/);
  const ports = [...api.matchAll(/^\s+- "([^"]*:\d+)"$/gm)].map((m) => m[1]);
  expect(ports).toEqual(['127.0.0.1:${PANDAFIT_PORT:-7003}:8080']);
});

test('scripts are executable and the lockfile exists', () => {
  for (const f of ['backup.sh', 'restore-drill.sh', 'mac/install-pull.sh', 'mac/pull-backups.sh']) expect(statSync(resolve(root, 'web-server', f)).mode & 0o111, f).toBeGreaterThan(0);
  expect(read('web-server/package-lock.json')).toContain('"fastify"');
});
