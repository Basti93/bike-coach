import { spawn } from 'node:child_process';
import path from 'node:path';

const SAFE_ID = /^[A-Za-z0-9-]+$/;
const TIMEOUT_MS = 120_000;

export type UploadResult = { status: 'uploaded' } | { status: 'failed'; reason: string };
type Options = {
  python: string; script: string; baseDir: string; exportsDir: string; rideOpen: () => boolean; hasTokens: (profileId: string) => boolean;
  onResult: (profileId: string, rideId: string, result: UploadResult) => void; spawnFn?: typeof spawn;
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

  constructor(private opts: Options) {}

  upload(profileId: string, rideId: string, name: string, startMs: number, description?: string): boolean {
    if (!SAFE_ID.test(profileId) || !SAFE_ID.test(rideId) || this.opts.rideOpen() || !this.opts.hasTokens(profileId) || this.running.has(profileId)) return false;
    this.running.add(profileId);
    const child = (this.opts.spawnFn ?? spawn)(this.opts.python, [
      this.opts.script, '--tokens', path.join(this.opts.baseDir, 'tokens', profileId), '--file', path.join(this.opts.exportsDir, `${rideId}.fit`), '--name', name, '--start-ms', String(startMs),
      ...(description ? ['--description', description] : []),
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    let ended = false;
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    timer.unref?.();
    const end = (result: UploadResult): void => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      this.running.delete(profileId);
      this.opts.onResult(profileId, rideId, result);
    };
    child.stdout?.on('data', (b: Buffer) => { out += String(b); });
    child.on('error', () => end(FAILED));
    child.on('close', () => end(parse(out)));
    return true;
  }
}
