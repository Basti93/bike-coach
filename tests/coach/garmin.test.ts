import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { GarminLink } from '../../src/coach/garmin';

const setup = (python = true, timeoutMs = 5000) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'garmin-'));
  const bin = path.join(dir, 'python');
  if (python) fs.writeFileSync(bin, '');
  const calls: { args: string[]; env: unknown; child: any; written: string[] }[] = [];
  const spawnFn: any = (_b: string, args: string[], opts: { env?: unknown }) => {
    const child: any = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = vi.fn();
    const written: string[] = [];
    child.stdin.on('data', (b: Buffer) => written.push(String(b)));
    calls.push({ args, env: opts.env, child, written });
    return child;
  };
  const updates = vi.fn();
  const link = new GarminLink({ baseDir: dir, python: bin, script: 'bridge.py', spawnFn, onUpdate: updates, timeoutMs });
  return { dir, link, calls, updates };
};
const tick = () => new Promise((r) => setTimeout(r, 5));

test('the password goes through stdin only, and the MFA code follows when asked', async () => {
  const { link, calls } = setup();
  link.login('p1', 'a@b.de', 'geheim');
  expect(link.status('p1').state).toBe('connecting');
  await tick();
  const c = calls[0];
  expect(JSON.stringify(c.args)).not.toContain('geheim');
  expect(JSON.stringify(c.env ?? '')).not.toContain('geheim');
  expect(c.written.join('')).toContain('geheim');
  c.child.stdout.write('{"status":"needs-mfa"}\n');
  await tick();
  expect(link.status('p1').state).toBe('needs-mfa');
  link.mfa('p1', '123456');
  await tick();
  expect(c.written.join('')).toContain('"mfa":"123456"');
});
test('a saved token means connected, and disconnecting removes it', async () => {
  const { dir, link } = setup();
  const t = path.join(dir, 'tokens', 'p1');
  fs.mkdirSync(t, { recursive: true });
  fs.writeFileSync(path.join(t, 'garmin_tokens.json'), '{}');
  expect(link.status('p1').state).toBe('connected');
  link.disconnect('p1');
  expect(fs.existsSync(t)).toBe(false);
  expect(link.status('p1').state).toBe('idle');
});
test('failures carry a reason and rate limits are not retried automatically', async () => {
  const { link, calls } = setup();
  link.login('p1', 'a@b.de', 'x');
  calls[0].child.stdout.write('{"status":"failed","reason":"rate-limit"}\n');
  await tick();
  expect(link.status('p1')).toEqual({ state: 'failed', reason: 'rate-limit' });
  expect(calls).toHaveLength(1);
});
test('a hanging login times out and the process is stopped', async () => {
  const { link, calls } = setup(true, 40);
  link.login('p1', 'a@b.de', 'x');
  await new Promise((r) => setTimeout(r, 60));
  expect(calls[0].child.kill).toHaveBeenCalled();
  expect(link.status('p1').state).toBe('failed');
});
test('a process that ends without an answer counts as failed', async () => {
  const { link, calls } = setup();
  link.login('p1', 'a@b.de', 'x');
  calls[0].child.emit('close');
  expect(link.status('p1').state).toBe('failed');
});
test('a missing helper reports setup, unsafe ids are refused, a second login is ignored', () => {
  const missing = setup(false);
  missing.link.login('p1', 'a@b.de', 'x');
  expect(missing.link.status('p1')).toEqual({ state: 'failed', reason: 'setup' });
  const { dir, link, calls } = setup();
  fs.mkdirSync(path.join(dir, 'keep'));
  link.disconnect('../keep');
  expect(fs.existsSync(path.join(dir, 'keep'))).toBe(true);
  link.login('../x', 'a@b.de', 'x');
  expect(calls).toHaveLength(0);
  link.login('p1', 'a@b.de', 'x');
  link.login('p1', 'a@b.de', 'x');
  expect(calls).toHaveLength(1);
});
