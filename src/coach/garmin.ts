import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GarminStatus } from '../shared/coach-protocol';
import { plainTokens, type GarminTokens } from './secrets/garmin-tokens';

const TIMEOUT_MS = 5 * 60_000; // Also long enough to fetch the two-factor code.
const SAFE_ID = /^[A-Za-z0-9-]+$/;

type Options = { baseDir: string; python: string; script: string; onUpdate: () => void; spawnFn?: typeof spawn; timeoutMs?: number; tokens?: GarminTokens };
/** release: ends the token checkout once the helper program has exited. A disconnect drops it instead. */
type Running = { child: ReturnType<typeof spawn>; timer: ReturnType<typeof setTimeout>; release: { done: boolean } };

/** Holds the Garmin login per profile. The password goes to the helper program only over stdin and is not kept anywhere here. */
export class GarminLink {
  private states = new Map<string, GarminStatus>();
  private running = new Map<string, Running>();
  private tokens: GarminTokens;
  constructor(private opts: Options) {
    this.tokens = opts.tokens ?? plainTokens(opts.baseDir);
  }

  status(profileId: string): GarminStatus {
    const current = this.states.get(profileId);
    if (current) return current;
    if (!SAFE_ID.test(profileId)) return { state: 'idle' };
    return this.tokens.has(profileId) ? { state: 'connected' } : { state: 'idle' };
  }

  private set(profileId: string, status: GarminStatus): void {
    this.states.set(profileId, status);
    this.opts.onUpdate();
  }

  login(profileId: string, email: string, password: string): void {
    if (!SAFE_ID.test(profileId) || this.running.has(profileId)) return;
    if (!fs.existsSync(this.opts.python)) { this.set(profileId, { state: 'failed', reason: 'setup' }); return; }
    let tokenDir: string;
    try { tokenDir = this.tokens.checkout(profileId); } catch { this.set(profileId, { state: 'failed', reason: 'failed' }); return; }
    const release = { done: false };
    // Only once the program has exited: it may still write the tokens after reporting.
    const checkin = (): void => {
      if (release.done) return;
      release.done = true;
      try { this.tokens.checkin(profileId); } catch { /* the folder is wiped either way */ }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = (this.opts.spawnFn ?? spawn)(this.opts.python, [this.opts.script], { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch { checkin(); this.set(profileId, { state: 'failed', reason: 'setup' }); return; }
    const finish = (status: GarminStatus): void => {
      const run = this.running.get(profileId);
      if (!run || run.child !== child) return;
      clearTimeout(run.timer);
      this.running.delete(profileId);
      this.set(profileId, status);
    };
    const timer = setTimeout(() => { child.kill(); checkin(); finish({ state: 'failed', reason: 'failed' }); }, this.opts.timeoutMs ?? TIMEOUT_MS);
    this.running.set(profileId, { child, timer, release });
    this.set(profileId, { state: 'connecting' });

    let buffer = '';
    child.stdout?.on('data', (b: Buffer) => {
      buffer += String(b);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const m = JSON.parse(line) as { status?: string; reason?: 'credentials' | 'rate-limit' | 'failed' };
          if (m.status === 'needs-mfa') this.set(profileId, { state: 'needs-mfa' });
          if (m.status === 'connected') {
            // The helper program may still write the check file after this, only the timer ends here.
            finish({ state: 'connected' });
          }
          if (m.status === 'failed') finish({ state: 'failed', reason: m.reason ?? 'failed' });
        } catch { /* not a protocol line */ }
      }
    });
    child.on('error', () => { checkin(); finish({ state: 'failed', reason: 'setup' }); });
    child.on('close', () => { checkin(); finish({ state: 'failed', reason: 'failed' }); });
    child.stdin?.on('error', () => { /* process already ended, close reports the error */ });
    child.stdin?.write(`${JSON.stringify({
      tokens: tokenDir,
      check: path.join(this.opts.baseDir, `login-check-${profileId}.json`),
      email, password,
    })}\n`);
  }

  mfa(profileId: string, code: string): void {
    const run = this.running.get(profileId);
    if (!run) return;
    run.child.stdin?.write(`${JSON.stringify({ mfa: code })}\n`);
    this.set(profileId, { state: 'connecting' });
  }

  disconnect(profileId: string): void {
    if (!SAFE_ID.test(profileId)) return;
    const run = this.running.get(profileId);
    if (run) { run.release.done = true; clearTimeout(run.timer); run.child.kill(); this.running.delete(profileId); }
    this.tokens.remove(profileId);
    this.states.delete(profileId);
    this.opts.onUpdate();
  }
}
