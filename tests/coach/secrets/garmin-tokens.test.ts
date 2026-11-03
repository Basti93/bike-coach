import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { GarminSync } from '../../../src/coach/garmin-sync';
import { GarminLink } from '../../../src/coach/garmin';
import { GarminUploader } from '../../../src/coach/garmin-uploader';
import { plainTokens, sealedTokens } from '../../../src/coach/secrets/garmin-tokens';
import { sealedCodec } from '../../../src/coach/secrets/secret-box';

const KEY = Buffer.alloc(32, 9);
const TOKEN_TEXT = '{"oauth":"token-text-sehr-geheim"}';
const mode = (p: string) => fs.statSync(p).mode & 0o777;
const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), name));

const filesUnder = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? filesUnder(p) : [p];
});

const sealedSetup = () => {
  const garminDir = tmp('garmin-');
  const runDir = path.join(tmp('run-'), 'pandafit-secrets');
  const tokens = sealedTokens({ garminDir, runDir, codec: (id) => sealedCodec(KEY, `acc-${id}:garmin`) });
  return { garminDir, runDir, tokens };
};

/** Stores tokens as a login would: check out, the Python program writes the file, check in. */
const login = (tokens: ReturnType<typeof sealedTokens>, id: string, text = TOKEN_TEXT) => {
  const dir = tokens.checkout(id);
  fs.writeFileSync(path.join(dir, 'garmin_tokens.json'), text);
  tokens.checkin(id);
};

test('plain tokens use <garmin>/tokens/<id> and checkin changes nothing', () => {
  const garminDir = tmp('garmin-');
  const tokens = plainTokens(garminDir);
  const dir = path.join(garminDir, 'tokens', 'p1');
  expect(tokens.has('p1')).toBe(false);
  expect(tokens.mtimeMs('p1')).toBeNull();
  expect(tokens.checkout('p1')).toBe(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'garmin_tokens.json'), TOKEN_TEXT);
  const before = fs.statSync(path.join(dir, 'garmin_tokens.json')).mtimeMs;
  tokens.checkin('p1');
  expect(fs.readFileSync(path.join(dir, 'garmin_tokens.json'), 'utf8')).toBe(TOKEN_TEXT);
  expect(fs.readdirSync(dir)).toEqual(['garmin_tokens.json']);
  expect(tokens.has('p1')).toBe(true);
  expect(tokens.mtimeMs('p1')).toBe(before);
  tokens.remove('p1');
  expect(fs.existsSync(dir)).toBe(false);
  expect(tokens.has('p1')).toBe(false);
});

test('sealed checkout writes garmin_tokens.json under runDir with mode 0600; checkin seals a changed file back and removes the run folder', () => {
  const { garminDir, runDir, tokens } = sealedSetup();
  login(tokens, 'p1');
  const sealedFile = path.join(garminDir, 'tokens', 'p1', 'garmin_tokens.json.sealed');
  expect(fs.readFileSync(sealedFile, 'utf8').startsWith('pfs1.')).toBe(true);
  expect(mode(sealedFile)).toBe(0o600);
  expect(tokens.has('p1')).toBe(true);
  const firstMtime = tokens.mtimeMs('p1');
  expect(firstMtime).not.toBeNull();

  const dir = tokens.checkout('p1');
  expect(dir).toBe(path.join(runDir, 'p1'));
  expect(mode(runDir)).toBe(0o700);
  expect(mode(dir)).toBe(0o700);
  const file = path.join(dir, 'garmin_tokens.json');
  expect(fs.readFileSync(file, 'utf8')).toBe(TOKEN_TEXT);
  expect(mode(file)).toBe(0o600);

  // Unchanged: the sealed file stays as it is, so a sync does not take it for a new login.
  const sealedBefore = fs.readFileSync(sealedFile, 'utf8');
  tokens.checkin('p1');
  expect(fs.existsSync(dir)).toBe(false);
  expect(fs.readFileSync(sealedFile, 'utf8')).toBe(sealedBefore);

  // Changed (the program refreshed its token): sealed back.
  const again = tokens.checkout('p1');
  fs.writeFileSync(path.join(again, 'garmin_tokens.json'), '{"oauth":"refreshed"}');
  tokens.checkin('p1');
  expect(fs.existsSync(again)).toBe(false);
  expect(fs.readFileSync(sealedFile, 'utf8')).not.toBe(sealedBefore);
  const third = tokens.checkout('p1');
  expect(fs.readFileSync(path.join(third, 'garmin_tokens.json'), 'utf8')).toBe('{"oauth":"refreshed"}');
  tokens.checkin('p1');
});

test('with sealed tokens no file under garminDir contains the token text', () => {
  const { garminDir, tokens } = sealedSetup();
  login(tokens, 'p1');
  const dir = tokens.checkout('p1');
  fs.writeFileSync(path.join(dir, 'garmin_tokens.json'), TOKEN_TEXT.replace('sehr', 'neu'));
  tokens.checkin('p1');
  const files = filesUnder(garminDir);
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    expect(text).not.toContain('token-text');
    expect(text).not.toContain('oauth');
  }
});

test('overlapping checkouts share one folder, which goes with the last checkin', () => {
  const { tokens } = sealedSetup();
  login(tokens, 'p1');
  const a = tokens.checkout('p1');
  const b = tokens.checkout('p1');
  expect(b).toBe(a);
  tokens.checkin('p1');
  expect(fs.existsSync(path.join(a, 'garmin_tokens.json'))).toBe(true);
  tokens.checkin('p1');
  expect(fs.existsSync(a)).toBe(false);
});

test('tokens sealed for one profile do not open for another, and the error carries no token', () => {
  const { garminDir, tokens } = sealedSetup();
  login(tokens, 'p1');
  fs.mkdirSync(path.join(garminDir, 'tokens', 'p2'), { recursive: true });
  fs.copyFileSync(path.join(garminDir, 'tokens', 'p1', 'garmin_tokens.json.sealed'), path.join(garminDir, 'tokens', 'p2', 'garmin_tokens.json.sealed'));
  let message = '';
  try { tokens.checkout('p2'); } catch (e) { message = `${String(e)} ${(e as Error).stack ?? ''}`; }
  expect(message).not.toBe('');
  expect(message).not.toContain('token-text');
  expect(fs.existsSync(path.join(tokens.checkout('p1'), '..', 'p2'))).toBe(false);
  tokens.checkin('p1');
});

test('remove deletes the sealed tokens and a checked-out folder, and a late checkin brings nothing back', () => {
  const { garminDir, runDir, tokens } = sealedSetup();
  login(tokens, 'p1');
  const dir = tokens.checkout('p1');
  tokens.remove('p1');
  expect(fs.existsSync(path.join(garminDir, 'tokens', 'p1'))).toBe(false);
  expect(fs.existsSync(dir)).toBe(false);
  tokens.checkin('p1');
  expect(tokens.has('p1')).toBe(false);
  expect(fs.existsSync(path.join(runDir, 'p1'))).toBe(false);
});

test('unsafe ids are refused', () => {
  const { tokens } = sealedSetup();
  expect(tokens.has('../p1')).toBe(false);
  expect(() => tokens.checkout('../p1')).toThrow();
  expect(() => plainTokens(tmp('garmin-')).checkout('../x')).toThrow();
});

// ---- the Python runs around checkout and checkin ----

const fakeSpawn = () => {
  const children: any[] = [];
  const spawnFn: any = (_bin: string, args: string[]) => {
    const child: any = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.args = args;
    child.kill = vi.fn(() => child.emit('close', null, 'SIGTERM'));
    children.push(child);
    return child;
  };
  return { children, spawnFn };
};

test('not there: no tokens means has() is false and no Python run starts', () => {
  const { garminDir, tokens } = sealedSetup();
  const python = path.join(garminDir, 'python');
  fs.writeFileSync(python, '');
  const { children, spawnFn } = fakeSpawn();
  expect(tokens.has('p1')).toBe(false);
  expect(tokens.mtimeMs('p1')).toBeNull();
  const sync = new GarminSync({ baseDir: garminDir, python, script: 's.py', spawnFn, tokens, rideOpen: () => false, onUpdate: () => {}, nowMs: () => 1 });
  sync.tick('p1');
  const uploader = new GarminUploader({ python, script: 'u.py', baseDir: garminDir, exportsDir: '/x', tokens, rideOpen: () => false, onResult: () => {}, spawnFn });
  expect(uploader.upload('p1', 'r1', 'Fahrt', 1)).toBe(false);
  const link = new GarminLink({ baseDir: garminDir, python, script: 'b.py', spawnFn, tokens, onUpdate: () => {} });
  expect(link.status('p1')).toEqual({ state: 'idle' });
  expect(children).toHaveLength(0);
});

test('a sealed sync run gets the run folder, and a crash wipes it while keeping the tokens', async () => {
  const { garminDir, runDir, tokens } = sealedSetup();
  login(tokens, 'p1');
  const python = path.join(garminDir, 'python');
  fs.writeFileSync(python, '');
  const { children, spawnFn } = fakeSpawn();
  const sync = new GarminSync({ baseDir: garminDir, python, script: 's.py', spawnFn, tokens, rideOpen: () => false, onUpdate: () => {}, nowMs: () => 1 });
  sync.tick('p1');
  expect(children).toHaveLength(1);
  const args: string[] = children[0].args;
  expect(args[args.indexOf('--tokens') + 1]).toBe(path.join(runDir, 'p1'));
  expect(fs.readFileSync(path.join(runDir, 'p1', 'garmin_tokens.json'), 'utf8')).toBe(TOKEN_TEXT);
  children[0].emit('error', new Error('boom'));
  children[0].emit('close', 1, null);
  expect(fs.existsSync(path.join(runDir, 'p1'))).toBe(false);
  expect(tokens.has('p1')).toBe(true);
  expect(sync.info('p1').problem).toBe('failed');
});

test('a sealed sync run with a broken sealed file starts nothing and leaves no folder', () => {
  const { garminDir, runDir, tokens } = sealedSetup();
  fs.mkdirSync(path.join(garminDir, 'tokens', 'p1'), { recursive: true });
  fs.writeFileSync(path.join(garminDir, 'tokens', 'p1', 'garmin_tokens.json.sealed'), 'pfs1.kaputt');
  const python = path.join(garminDir, 'python');
  fs.writeFileSync(python, '');
  const { children, spawnFn } = fakeSpawn();
  const sync = new GarminSync({ baseDir: garminDir, python, script: 's.py', spawnFn, tokens, rideOpen: () => false, onUpdate: () => {}, nowMs: () => 1 });
  sync.tick('p1');
  expect(children).toHaveLength(0);
  expect(fs.existsSync(path.join(runDir, 'p1'))).toBe(false);
  expect(sync.info('p1').problem).toBe('failed');
});

test('a sealed upload that times out or fails wipes the run folder', async () => {
  vi.useFakeTimers();
  try {
    const { garminDir, runDir, tokens } = sealedSetup();
    login(tokens, 'p1');
    const { children, spawnFn } = fakeSpawn();
    const results: unknown[] = [];
    const uploader = new GarminUploader({ python: 'py', script: 'u.py', baseDir: garminDir, exportsDir: '/x', tokens, rideOpen: () => false, onResult: (_p, _r, x) => results.push(x), spawnFn });
    expect(uploader.upload('p1', 'r1', 'Fahrt', 1)).toBe(true);
    const args: string[] = children[0].args;
    expect(args[args.indexOf('--tokens') + 1]).toBe(path.join(runDir, 'p1'));
    expect(fs.existsSync(path.join(runDir, 'p1', 'garmin_tokens.json'))).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(children[0].kill).toHaveBeenCalled();
    expect(fs.existsSync(path.join(runDir, 'p1'))).toBe(false);
    expect(results).toHaveLength(1);

    expect(uploader.upload('p1', 'r2', 'Fahrt', 1)).toBe(true);
    children[1].emit('error', new Error('spawn failed'));
    expect(fs.existsSync(path.join(runDir, 'p1'))).toBe(false);
    expect(tokens.has('p1')).toBe(true);
  } finally { vi.useRealTimers(); }
});

test('a sealed login stores the new tokens sealed once the helper ends, and a disconnect leaves nothing', () => {
  const { garminDir, runDir, tokens } = sealedSetup();
  const python = path.join(garminDir, 'python');
  fs.writeFileSync(python, '');
  const { children, spawnFn } = fakeSpawn();
  const link = new GarminLink({ baseDir: garminDir, python, script: 'b.py', spawnFn, tokens, onUpdate: () => {} });
  link.login('p1', 'a@b.c', 'pw');
  const request = JSON.parse(String(children[0].stdin.read()).split('\n')[0]);
  const dir = path.join(runDir, 'p1');
  expect(request.tokens).toBe(dir);
  expect(fs.statSync(dir).isDirectory()).toBe(true);
  fs.writeFileSync(path.join(dir, 'garmin_tokens.json'), TOKEN_TEXT);
  children[0].stdout.write(`${JSON.stringify({ status: 'connected' })}\n`);
  children[0].emit('close', 0, null);
  expect(fs.existsSync(dir)).toBe(false);
  expect(link.status('p1')).toEqual({ state: 'connected' });
  expect(tokens.has('p1')).toBe(true);

  // A login that is still running when the profile disconnects: the late exit brings nothing back.
  const fresh = new GarminLink({ baseDir: garminDir, python, script: 'b.py', spawnFn, tokens, onUpdate: () => {} });
  fresh.login('p1', 'a@b.c', 'pw');
  fs.writeFileSync(path.join(dir, 'garmin_tokens.json'), TOKEN_TEXT);
  fresh.disconnect('p1');
  expect(fs.existsSync(dir)).toBe(false);
  expect(tokens.has('p1')).toBe(false);
  expect(fresh.status('p1')).toEqual({ state: 'idle' });
});
