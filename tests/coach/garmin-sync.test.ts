import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { GarminSync } from '../../src/coach/garmin-sync';

const HOUR = 3600_000;
const setup = (opts: { tokens?: boolean; python?: boolean } = {}) => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garmin-sync-'));
  const python = path.join(baseDir, 'python');
  if (opts.python !== false) fs.writeFileSync(python, '');
  const tokens = path.join(baseDir, 'tokens', 'p1');
  if (opts.tokens !== false) { fs.mkdirSync(tokens, { recursive: true }); fs.writeFileSync(path.join(tokens, 'garmin_tokens.json'), '{}'); }
  const children: any[] = [];
  const spawnFn: any = (_bin: string, args: string[]) => {
    const child: any = new EventEmitter();
    child.stdout = new PassThrough();
    child.args = args;
    child.kill = vi.fn(() => child.emit('close', null, 'SIGTERM'));
    children.push(child);
    return child;
  };
  const env = { now: 1_000_000_000, ride: false };
  const make = () => new GarminSync({ baseDir, python, script: 's.py', spawnFn, rideOpen: () => env.ride, onUpdate: () => {}, nowMs: () => env.now });
  const finish = async (code: number, line?: object) => {
    const c = children.at(-1);
    if (line) c.stdout.write(`${JSON.stringify(line)}\n`);
    await new Promise((r) => setTimeout(r, 2));
    c.emit('close', code, null);
  };
  return { baseDir, tokens, children, env, make, sync: make(), finish };
};

test('starts the tool with tokens and database of this profile, and never twice', () => {
  const { sync, children, baseDir } = setup();
  sync.tick('p1');
  sync.tick('p1');
  expect(children).toHaveLength(1);
  expect(children[0].args).toEqual(expect.arrayContaining(['--tokens', path.join(baseDir, 'tokens', 'p1'), '--db', path.join(baseDir, 'data', 'p1', 'garmin.db')]));
  expect(sync.info('p1').running).toBe(true);
});
test('does not start without tokens or during a ride', () => {
  const none = setup({ tokens: false });
  none.sync.tick('p1');
  expect(none.children).toHaveLength(0);
  const riding = setup();
  riding.env.ride = true;
  riding.sync.tick('p1');
  expect(riding.children).toHaveLength(0);
});
test('runs every 3 hours until the history is complete, then every 6', async () => {
  const { sync, children, env, finish } = setup();
  sync.tick('p1');
  await finish(0, { status: 'ok', complete: false });
  expect(sync.info('p1')).toMatchObject({ running: false, complete: false, lastRunMs: env.now, problem: null });
  env.now += 3 * HOUR - 1;
  sync.tick('p1');
  expect(children).toHaveLength(1);
  env.now += 1;
  sync.tick('p1');
  expect(children).toHaveLength(2);
  await finish(0, { status: 'ok', complete: true });
  env.now += 3 * HOUR;
  sync.tick('p1');
  expect(children).toHaveLength(2);
  env.now += 3 * HOUR;
  sync.tick('p1');
  expect(children).toHaveLength(3);
});
test('a ride stops a running sync, without counting as a failure, and it resumes afterwards', async () => {
  const { sync, children, env } = setup();
  sync.tick('p1');
  env.ride = true;
  sync.tick('p1');
  expect(children[0].kill).toHaveBeenCalled();
  expect(sync.info('p1')).toMatchObject({ running: false, problem: null, lastRunMs: null });
  env.ride = false;
  sync.tick('p1');
  expect(children).toHaveLength(2);
});
test('an expired login stops further runs until new tokens exist', async () => {
  const { sync, children, env, finish, tokens } = setup();
  sync.tick('p1');
  await finish(10);
  expect(sync.info('p1').problem).toBe('reauth');
  env.now += 24 * HOUR;
  sync.tick('p1');
  expect(children).toHaveLength(1);
  const f = path.join(tokens, 'garmin_tokens.json');
  fs.writeFileSync(f, '{"neu":1}');
  fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
  sync.tick('p1');
  expect(children).toHaveLength(2);
  expect(sync.info('p1').problem).toBeNull();
});
test('a rate limit waits six hours', async () => {
  const { sync, children, env, finish } = setup();
  sync.tick('p1');
  await finish(11);
  expect(sync.info('p1').problem).toBe('rate-limit');
  env.now += 6 * HOUR - 1;
  sync.tick('p1');
  expect(children).toHaveLength(1);
  env.now += 1;
  sync.tick('p1');
  expect(children).toHaveLength(2);
});
test('another failure retries after 30 minutes', async () => {
  const { sync, children, env, finish } = setup();
  sync.tick('p1');
  await finish(12);
  expect(sync.info('p1').problem).toBe('failed');
  env.now += 30 * 60_000;
  sync.tick('p1');
  expect(children).toHaveLength(2);
});
test('a missing helper reports a failure instead of throwing', () => {
  const { sync, children } = setup({ python: false });
  sync.tick('p1');
  expect(children).toHaveLength(0);
  expect(sync.info('p1').problem).toBe('failed');
});
test('the status survives a restart', async () => {
  const { sync, make, children, env, finish } = setup();
  sync.tick('p1');
  await finish(0, { status: 'ok', complete: true });
  const again = make();
  expect(again.info('p1')).toMatchObject({ complete: true, lastRunMs: env.now });
  again.tick('p1');
  expect(children).toHaveLength(1);
});
test('unsafe profile ids are ignored', () => {
  const { sync, children } = setup();
  sync.tick('../p1');
  expect(children).toHaveLength(0);
});
