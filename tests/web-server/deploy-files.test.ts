import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const files = ['Dockerfile', 'Dockerfile.dockerignore', 'Dockerfile.coach', 'Dockerfile.coach.dockerignore', 'backup-coach.sh', 'restore-drill-coach.sh', 'compose.yaml', 'serve.json', '.env.example', 'backup.sh', 'restore-drill.sh', 'mac/install-pull.sh', 'mac/pull-backups.sh', 'README.md'].map((f) => `web-server/${f}`);

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
  expect(read('web-server/.env.example')).toMatch(/^PANDAFIT_PUSH_SUBJECT=$/m);
});

test('push: the subject comes from the environment, and the restore drill never notifies', () => {
  const env = compose().services.api!.environment!;
  expect(env.PANDAFIT_PUSH_SUBJECT).toBe('${PANDAFIT_PUSH_SUBJECT:-}');
  expect(env.PANDAFIT_PUSH).toBe('${PANDAFIT_PUSH:-on}');
  expect(read('web-server/restore-drill.sh')).toMatch(/docker run -d --name "\$app" -e PANDAFIT_PUSH=off /);
  // VAPID keys live in the database, never in the image or repo.
  for (const f of ['web-server/Dockerfile', 'web-server/compose.yaml', 'web-server/.env.example']) expect(read(f), f).not.toMatch(/VAPID_(PRIVATE|PUBLIC)/i);
});

type Service = Record<string, unknown> & { environment?: Record<string, string>; ports?: string[]; networks?: string[]; volumes?: string[]; tmpfs?: string[]; logging?: { options?: Record<string, string> } };
const compose = () => parse(read('web-server/compose.yaml')) as { services: Record<string, Service>; networks: Record<string, { internal?: boolean }> };

describe.each(['api', 'tailscale'])('compose service %s', (name) => {
  const svc = () => compose().services[name]!;
  test('is locked down', () => {
    expect(svc().read_only).toBe(true);
    expect(svc().cap_drop).toEqual(['ALL']);
    expect(svc().security_opt).toContain('no-new-privileges:true');
    expect(svc().tmpfs).toEqual(expect.arrayContaining(['/tmp']));
  });
  test('has memory, cpu and pid limits and log rotation', () => {
    expect(svc().mem_limit).toBe(name === 'api' ? '256m' : '128m');
    expect(Number(svc().cpus)).toBeGreaterThan(0);
    expect(Number(svc().cpus)).toBeLessThanOrEqual(1);
    expect(svc().pids_limit).toBeGreaterThan(0);
    expect(svc().logging?.options).toEqual({ 'max-size': '10m', 'max-file': '3' });
  });
  test('has no env_file', () => expect(svc()).not.toHaveProperty('env_file'));
});

test('only the API publishes a port, and only on localhost', () => {
  const { services } = compose();
  expect(services.api!.ports).toEqual(['127.0.0.1:${PANDAFIT_PORT:-7004}:8080']);
  expect(services.tailscale).not.toHaveProperty('ports');
  expect(services.tailscale).not.toHaveProperty('network_mode');
  expect(services.tailscale).not.toHaveProperty('cap_add');
  expect(services.tailscale).not.toHaveProperty('devices');
});

test('the Tailscale key reaches only the sidecar, which runs in userspace mode', () => {
  const { services } = compose();
  expect(services.tailscale!.environment).toMatchObject({ TS_USERSPACE: 'true', TS_HOSTNAME: 'pandafit' });
  expect(services.tailscale!.environment).toHaveProperty('TS_AUTHKEY');
  expect(Object.keys(services.api!.environment ?? {}).filter((k) => k.startsWith('TS_'))).toEqual([]);
  expect(JSON.stringify(services.api)).not.toContain('TS_AUTHKEY');
});

test('the image runs as node and the build context hides secrets', () => {
  expect(read('web-server/Dockerfile')).toMatch(/^USER node$/m);
  expect(read('web-server/Dockerfile')).toContain('--ignore-scripts');
  const ign = read('web-server/Dockerfile.dockerignore').split('\n');
  for (const e of ['**/node_modules', '**/.env', '.git', 'out']) expect(ign).toContain(e);
});

test('scripts are executable and the lockfile exists', () => {
  for (const f of ['backup.sh', 'restore-drill.sh', 'mac/install-pull.sh', 'mac/pull-backups.sh']) expect(statSync(resolve(root, 'web-server', f)).mode & 0o111, f).toBeGreaterThan(0);
  expect(read('web-server/package-lock.json')).toContain('"fastify"');
});

test('the coach has no ports, read_only, cap_drop ALL, mem_limit 768m and restart unless-stopped, and serve.json does not name it', () => {
  const coach = compose().services.coach!;
  expect(coach).not.toHaveProperty('ports');
  expect(coach).not.toHaveProperty('network_mode');
  expect(coach).not.toHaveProperty('env_file');
  expect(coach.read_only).toBe(true);
  expect(coach.cap_drop).toEqual(['ALL']);
  expect(coach.security_opt).toContain('no-new-privileges:true');
  expect(coach.mem_limit).toBe('768m');
  expect(Number(coach.cpus)).toBe(1);
  expect(coach.pids_limit).toBe(256);
  expect(coach.restart).toBe('unless-stopped');
  expect(coach.logging?.options).toEqual({ 'max-size': '10m', 'max-file': '3' });
  expect(coach.environment!.TZ).toBe('${TZ:-UTC}');
  // The tmpfs mounts must be writable for user node (uid 1000).
  expect(coach.tmpfs).toEqual(['/tmp:uid=1000,gid=1000,mode=0700', '/run/pandafit-secrets:uid=1000,gid=1000,mode=0700']);
  expect(coach.healthcheck).toBeTruthy();
  expect(read('web-server/serve.json')).not.toMatch(/coach/);
});

test('api and coach share the internal network, which has no way out, and no coach or internal port is published', () => {
  const { services, networks } = compose();
  expect(networks.internal).toEqual({ internal: true });
  expect(services.api!.networks).toEqual(expect.arrayContaining(['default', 'internal']));
  expect(services.coach!.networks).toEqual(expect.arrayContaining(['default', 'internal']));
  expect(services.tailscale!.networks).toBeUndefined();
  expect(services.api!.environment!.PANDAFIT_COACH_URL).toBe('http://coach:8090');
  expect(services.api!.environment!.PANDAFIT_INTERNAL_TOKEN).toMatch(/^\$\{PANDAFIT_INTERNAL_TOKEN:\?/);
  expect(services.coach!.environment!.PANDAFIT_INTERNAL_TOKEN).toMatch(/^\$\{PANDAFIT_INTERNAL_TOKEN:\?/);
  for (const [name, svc] of Object.entries(services)) {
    for (const p of svc.ports ?? []) expect(p, name).not.toMatch(/8081|8090/);
  }
  expect(services.api!.ports).toHaveLength(1);
});

test('only the coach gets PANDAFIT_SECRET_KEY and only the coach mounts pandafit_coach', () => {
  const { services } = compose();
  for (const [name, svc] of Object.entries(services)) {
    expect(JSON.stringify(svc).includes('PANDAFIT_SECRET_KEY'), name).toBe(name === 'coach');
    expect((svc.volumes ?? []).some((v) => v.startsWith('coach:')), name).toBe(name === 'coach');
  }
  expect(read('web-server/compose.yaml')).toContain('name: pandafit_coach');
});

test("the project's memory limits add up to at most 2048 MiB", () => {
  const mib = Object.values(compose().services).map((s) => Number(String(s.mem_limit).replace(/m$/, '')));
  expect(mib.every((n) => n > 0)).toBe(true);
  expect(mib.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2048);
});

test('the coach image runs as node, pins the Claude CLI and finds Claude and Python', () => {
  const d = read('web-server/Dockerfile.coach');
  expect(d).toMatch(/^USER node$/m);
  expect(d).toMatch(/@anthropic-ai\/claude-code@\d+\.\d+\.\d+/);
  expect(d).toContain('--ignore-scripts');
  expect(d).toContain('garminconnect==0.3.20');
  expect(d).toContain('COPY src/tracking ./src/tracking');
  expect(d).toContain('HOME=/data/home');
  expect(d).toContain('BIKE_CLAUDE_BIN=/usr/local/bin/claude');
  expect(d).toContain('PANDAFIT_GARMIN_PYTHON=/opt/garmin-venv/bin/python3');
  expect(d).toContain('PANDAFIT_GARMIN_SCRIPTS=/app/scripts/garmin');
  expect(read('web-server/Dockerfile.coach.dockerignore').split('\n')).toEqual(expect.arrayContaining(['**/.env', '.git', '**/node_modules']));
});

test('the coach backup leaves out the Claude login and refuses unsealed secrets', () => {
  const b = read('web-server/backup-coach.sh');
  expect(b).toContain('home/.claude');
  expect(b).toContain('pfs1.');
  expect(read('web-server/mac/pull-backups.sh')).toContain('pandafit-coach-*.tar.gz');
});

test('the coach restore drill runs with --network none and PANDAFIT_COACH_DRY=1', () => {
  const r = read('web-server/restore-drill-coach.sh');
  expect(r).toMatch(/docker run -d --name "\$app" --network none -e PANDAFIT_COACH_DRY=1/);
  expect(r).toContain('gunzip -c');
  for (const f of ['backup-coach.sh', 'restore-drill-coach.sh']) expect(statSync(resolve(root, 'web-server', f)).mode & 0o111, f).toBeGreaterThan(0);
});
