import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GarminSyncInfo } from '../shared/coach-protocol';
import { plainTokens, type GarminTokens } from './secrets/garmin-tokens';

const HOUR = 3600_000;
const WHILE_LOADING_MS = 3 * HOUR;
const WHEN_COMPLETE_MS = 6 * HOUR;
const AFTER_RATE_LIMIT_MS = 6 * HOUR;
const AFTER_FAILURE_MS = 30 * 60_000;
const EXIT_REAUTH = 10;
const EXIT_RATE = 11;
const SAFE_ID = /^[A-Za-z0-9-]+$/;

type Options = { baseDir: string; python: string; script: string; rideOpen: () => boolean; onUpdate: () => void; nowMs: () => number; spawnFn?: typeof spawn; tokens?: GarminTokens };
type Meta = { lastRunMs: number | null; lastTryMs: number | null; complete: boolean; problem: GarminSyncInfo['problem']; tokensMtimeMs: number | null };
const EMPTY: Meta = { lastRunMs: null, lastTryMs: null, complete: false, problem: null, tokensMtimeMs: null };

/** Starts the standalone sync program on a schedule and never during a ride. Its state lives in its own database. */
export class GarminSync {
  private running = new Map<string, ReturnType<typeof spawn>>();
  private metas = new Map<string, Meta>();
  private stopping = new Set<string>();
  private tokens: GarminTokens;
  constructor(private opts: Options) {
    this.tokens = opts.tokens ?? plainTokens(opts.baseDir);
  }

  private dataDir(id: string): string { return path.join(this.opts.baseDir, 'data', id); }

  private meta(id: string): Meta {
    let m = this.metas.get(id);
    if (!m) {
      try { m = { ...EMPTY, ...JSON.parse(fs.readFileSync(path.join(this.dataDir(id), 'sync-meta.json'), 'utf8')) } as Meta; } catch { m = { ...EMPTY }; }
      this.metas.set(id, m);
    }
    return m;
  }

  private save(id: string, change: Partial<Meta>): void {
    const m = { ...this.meta(id), ...change };
    this.metas.set(id, m);
    try {
      fs.mkdirSync(this.dataDir(id), { recursive: true, mode: 0o700 });
      const file = path.join(this.dataDir(id), 'sync-meta.json');
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(m));
      fs.renameSync(`${file}.tmp`, file);
    } catch { /* then it only holds until the restart */ }
    this.opts.onUpdate();
  }

  info(id: string): GarminSyncInfo {
    if (!SAFE_ID.test(id)) return { running: false, lastRunMs: null, complete: false, problem: null };
    const { lastRunMs, complete, problem } = this.meta(id);
    return { running: this.running.has(id), lastRunMs, complete, problem };
  }

  private due(id: string, m: Meta, mtime: number): boolean {
    if (m.problem === 'reauth') return mtime !== m.tokensMtimeMs;
    if (m.lastTryMs === null) return true;
    const wait = m.problem === 'rate-limit' ? AFTER_RATE_LIMIT_MS
      : m.problem === 'failed' ? AFTER_FAILURE_MS
        : m.complete ? WHEN_COMPLETE_MS : WHILE_LOADING_MS;
    return this.opts.nowMs() - m.lastTryMs >= wait;
  }

  tick(id: string): void {
    if (!SAFE_ID.test(id)) return;
    const child = this.running.get(id);
    if (child) {
      if (this.opts.rideOpen()) { this.stopping.add(id); child.kill(); }
      return;
    }
    if (this.opts.rideOpen()) return;
    const mtime = this.tokens.mtimeMs(id);
    if (mtime === null) return;
    const m = this.meta(id);
    if (!this.due(id, m, mtime)) return;
    if (!fs.existsSync(this.opts.python)) {
      if (m.problem !== 'failed') this.save(id, { problem: 'failed', lastTryMs: this.opts.nowMs() });
      return;
    }
    this.start(id, mtime);
  }

  private start(id: string, mtime: number): void {
    const startedAt = this.opts.nowMs();
    const failed = (): void => this.save(id, { problem: 'failed', lastTryMs: startedAt, tokensMtimeMs: mtime });
    let tokenDir: string;
    try { tokenDir = this.tokens.checkout(id); } catch { failed(); return; }
    let checkedIn = false;
    const checkin = (): void => {
      if (checkedIn) return;
      checkedIn = true;
      try { this.tokens.checkin(id); } catch { /* the folder is wiped either way; the next login stores anew */ }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = (this.opts.spawnFn ?? spawn)(this.opts.python, [
        this.opts.script, '--tokens', tokenDir, '--db', path.join(this.dataDir(id), 'garmin.db'),
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { checkin(); failed(); return; }
    this.running.set(id, child);
    if (this.meta(id).problem === 'reauth') this.save(id, { problem: null });
    let complete = this.meta(id).complete;
    let buffer = '';
    child.stdout?.on('data', (b: Buffer) => {
      buffer += String(b);
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const m = JSON.parse(line) as { complete?: unknown; status?: unknown };
          if (m.status && typeof m.complete === 'boolean') complete = m.complete;
        } catch { /* not a protocol line */ }
      }
    });
    let ended = false;
    const end = (code: number | null): void => {
      if (ended) return;
      ended = true;
      checkin();
      this.running.delete(id);
      if (this.stopping.delete(id)) { this.opts.onUpdate(); return; }
      const problem = code === 0 ? null : code === EXIT_REAUTH ? 'reauth' : code === EXIT_RATE ? 'rate-limit' : 'failed';
      this.save(id, { lastTryMs: startedAt, complete, problem, tokensMtimeMs: mtime, ...(code === 0 ? { lastRunMs: this.opts.nowMs() } : {}) });
    };
    child.on('error', () => end(null));
    child.on('close', (code) => end(code));
    this.opts.onUpdate();
  }
}
