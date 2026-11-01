import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GarminStatus } from '../shared/coach-protocol';

const TIMEOUT_MS = 5 * 60_000; // Also long enough to fetch the two-factor code.
const SAFE_ID = /^[A-Za-z0-9-]+$/;

type Options = { baseDir: string; python: string; script: string; onUpdate: () => void; spawnFn?: typeof spawn; timeoutMs?: number };
type Running = { child: ReturnType<typeof spawn>; timer: ReturnType<typeof setTimeout> };

/** Holds the Garmin login per profile. The password goes to the helper program only over stdin and is not kept anywhere here. */
export class GarminLink {
  private states = new Map<string, GarminStatus>();
  private running = new Map<string, Running>();
  constructor(private opts: Options) {}

  private tokens(profileId: string): string { return path.join(this.opts.baseDir, 'tokens', profileId); }

  status(profileId: string): GarminStatus {
    const current = this.states.get(profileId);
    if (current) return current;
    if (!SAFE_ID.test(profileId)) return { state: 'idle' };
    return fs.existsSync(path.join(this.tokens(profileId), 'garmin_tokens.json')) ? { state: 'connected' } : { state: 'idle' };
  }

  private set(profileId: string, status: GarminStatus): void {
    this.states.set(profileId, status);
    this.opts.onUpdate();
  }

  login(profileId: string, email: string, password: string): void {
    if (!SAFE_ID.test(profileId) || this.running.has(profileId)) return;
    if (!fs.existsSync(this.opts.python)) { this.set(profileId, { state: 'failed', reason: 'setup' }); return; }
    const child = (this.opts.spawnFn ?? spawn)(this.opts.python, [this.opts.script], { stdio: ['pipe', 'pipe', 'ignore'] });
    const finish = (status: GarminStatus): void => {
      const run = this.running.get(profileId);
      if (!run || run.child !== child) return;
      clearTimeout(run.timer);
      this.running.delete(profileId);
      this.set(profileId, status);
    };
    const timer = setTimeout(() => { child.kill(); finish({ state: 'failed', reason: 'failed' }); }, this.opts.timeoutMs ?? TIMEOUT_MS);
    this.running.set(profileId, { child, timer });
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
    child.on('error', () => finish({ state: 'failed', reason: 'setup' }));
    child.on('close', () => finish({ state: 'failed', reason: 'failed' }));
    child.stdin?.on('error', () => { /* process already ended, close reports the error */ });
    child.stdin?.write(`${JSON.stringify({
      tokens: this.tokens(profileId),
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
    if (run) { clearTimeout(run.timer); run.child.kill(); this.running.delete(profileId); }
    fs.rmSync(this.tokens(profileId), { recursive: true, force: true });
    this.states.delete(profileId);
    this.opts.onUpdate();
  }
}
