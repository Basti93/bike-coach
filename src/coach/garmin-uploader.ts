import { spawn } from 'node:child_process';
import path from 'node:path';
import { plainTokens, type GarminTokens } from './secrets/garmin-tokens';

const SAFE_ID = /^[A-Za-z0-9-]+$/;
const TIMEOUT_MS = 120_000;

export type UploadResult = { status: 'uploaded' } | { status: 'failed'; reason: string };
type Options = {
  python: string; script: string; baseDir: string; exportsDir: string; rideOpen: () => boolean;
  /** Default: the tokens have it. */
  hasTokens?: (profileId: string) => boolean;
  onResult: (profileId: string, rideId: string, result: UploadResult) => void; spawnFn?: typeof spawn;
  /** Default: plain, in `<baseDir>/tokens/<id>`. */
  tokens?: GarminTokens;
};
const FAILED: UploadResult = { status: 'failed', reason: 'failed' };

const parse = (out: string): UploadResult => {
  try {
    const m = JSON.parse(out.trim().split('\n').pop() ?? '') as { status?: unknown; reason?: unknown };
    if (m.status === 'uploaded' || m.status === 'duplicate') return { status: 'uploaded' };
    return m.status === 'failed' && typeof m.reason === 'string' ? { status: 'failed', reason: m.reason } : FAILED;
  } catch { return FAILED; }
};

/** Runs the upload program, one per profile. None starts during a ride or without a Garmin login. */
export class GarminUploader {
  private running = new Set<string>();
  private tokens: GarminTokens;

  constructor(private opts: Options) {
    this.tokens = opts.tokens ?? plainTokens(opts.baseDir);
  }

  upload(profileId: string, rideId: string, name: string, startMs: number, description?: string): boolean {
    const hasTokens = this.opts.hasTokens ?? ((id: string) => this.tokens.has(id));
    if (!SAFE_ID.test(profileId) || !SAFE_ID.test(rideId) || this.opts.rideOpen() || !hasTokens(profileId) || this.running.has(profileId)) return false;
    let tokenDir: string;
    try { tokenDir = this.tokens.checkout(profileId); } catch { return false; }
    let checkedIn = false;
    const checkin = (): void => {
      if (checkedIn) return;
      checkedIn = true;
      try { this.tokens.checkin(profileId); } catch { /* the folder is wiped either way */ }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = (this.opts.spawnFn ?? spawn)(this.opts.python, [
        this.opts.script, '--tokens', tokenDir, '--file', path.join(this.opts.exportsDir, `${rideId}.fit`), '--name', name, '--start-ms', String(startMs),
        ...(description ? ['--description', description] : []),
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { checkin(); return false; }
    this.running.add(profileId);
    let out = '';
    let ended = false;
    // A run that hangs loses its tokens folder at once, not only when it finally exits.
    const timer = setTimeout(() => { child.kill(); checkin(); }, TIMEOUT_MS);
    timer.unref?.();
    const end = (result: UploadResult): void => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      checkin();
      this.running.delete(profileId);
      this.opts.onResult(profileId, rideId, result);
    };
    child.stdout?.on('data', (b: Buffer) => { out += String(b); });
    child.on('error', () => end(FAILED));
    child.on('close', () => end(parse(out)));
    return true;
  }
}
