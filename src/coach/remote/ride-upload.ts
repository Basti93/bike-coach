import fs from 'node:fs';
import path from 'node:path';
import { RIDE_ID, readRideUpload } from '../ride-upload-format';
import { CoachHttpError, type CoachHttp } from './coach-http';
import { remoteDir } from './home';

/** After a failed run, a profile's uploads wait this long. */
const RETRY_MS = 60_000;
const SAFE_ID = /^[A-Za-z0-9-]+$/;

export type RideUploadsOptions = {
  /** The recorder's rides folder. Only read, never written. */
  ridesDir: string;
  /** The local coach folder: the ledger lives in `<dir>/remote/<profileId>/rides.json`. */
  dir: string;
  /** The server coach's routes for a profile, or null without a link. */
  http: (profileId: string) => CoachHttp | null;
  /** False while a ride is open. Checked before every request. */
  noOpenRide: () => boolean;
  nowMs?: () => number;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A closed ride is one the recorder finished or aborted. Open and discarded rides stay on the Mac. */
const closedRide = (ridesDir: string, rideId: string, profileId: string): boolean => {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(ridesDir, rideId, 'meta.json'), 'utf8')) as unknown;
    return isObj(meta) && meta.rideId === rideId && meta.profileId === profileId && (meta.status === 'finished' || meta.status === 'aborted');
  } catch { return false; }
};

/**
 * Uploads a moved profile's finished rides after the ride, retried until the server confirmed the same hash. The ledger
 * remembers what the server holds. The ride files are only read: they stay on the Mac exactly as they are.
 */
export class RideUploads {
  private running: Promise<void> | null = null;
  private failedMs = new Map<string, number>();
  private readonly nowMs: () => number;

  constructor(private readonly opts: RideUploadsOptions) {
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  private ledgerFile(profileId: string): string { return path.join(remoteDir(this.opts.dir, profileId), 'rides.json'); }

  /** rideId → the hash the server confirmed. */
  private ledger(profileId: string): Record<string, string> {
    try {
      const d = JSON.parse(fs.readFileSync(this.ledgerFile(profileId), 'utf8')) as unknown;
      if (!isObj(d)) return {};
      return Object.fromEntries(Object.entries(d).filter((e): e is [string, string] => typeof e[1] === 'string'));
    } catch { return {}; }
  }

  /** The server holds this ride with this hash. */
  remember(profileId: string, rideId: string, sha256: string): void {
    if (!SAFE_ID.test(profileId)) return;
    const f = this.ledgerFile(profileId);
    const d = { ...this.ledger(profileId), [rideId]: sha256 };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(d));
    fs.renameSync(`${f}.tmp`, f);
  }

  /** The profile's closed rides, oldest first. */
  closed(profileId: string): string[] {
    if (!SAFE_ID.test(profileId)) return [];
    let names: string[] = [];
    try { names = fs.readdirSync(this.opts.ridesDir); } catch { return []; }
    return names.filter((n) => RIDE_ID.test(n) && closedRide(this.opts.ridesDir, n, profileId)).sort();
  }

  /** Closed rides the server does not hold yet. */
  pending(profileId: string): string[] {
    const have = this.ledger(profileId);
    return this.closed(profileId).filter((id) => have[id] === undefined);
  }

  /** One ride up. Throws CoachHttpError; the ledger changes only when the server confirms the same hash. */
  async upload(profileId: string, rideId: string, http: CoachHttp): Promise<void> {
    // Read again right before the request: only a closed ride of this profile goes.
    if (!closedRide(this.opts.ridesDir, rideId, profileId)) throw new CoachHttpError('refused', null, 'open');
    const u = readRideUpload(this.opts.ridesDir, rideId);
    const out = await http.putRide(u);
    if (out.sha256 !== u.sha256) throw new CoachHttpError('refused', null, 'hash');
    this.remember(profileId, rideId, u.sha256);
  }

  /**
   * Uploads what is pending, one ride after the other. Safe to call from the scan without awaiting; never rejects. Stops at once
   * when a ride opens, and waits a minute after a failure.
   */
  tick(profileId: string): Promise<void> {
    if (this.running) return this.running;
    const last = this.failedMs.get(profileId);
    if (last !== undefined && this.nowMs() - last < RETRY_MS) return Promise.resolve();
    const run = this.run(profileId).catch(() => { this.failedMs.set(profileId, this.nowMs()); }).finally(() => { if (this.running === run) this.running = null; });
    this.running = run;
    return run;
  }

  private async run(profileId: string): Promise<void> {
    const may = (): boolean => { try { return this.opts.noOpenRide(); } catch { return false; } };
    if (!may()) return;
    const pending = this.pending(profileId);
    if (pending.length === 0) return;
    const http = this.opts.http(profileId);
    if (!http) return;
    let failed = false;
    for (const rideId of pending) {
      if (!may()) return;
      try { await this.upload(profileId, rideId, http); } catch (e) {
        // The server is not there or the link was refused: the rest waits too. A refused ride does not hold up the others.
        if (!(e instanceof CoachHttpError) || e.kind !== 'refused') throw e;
        failed = true;
      }
    }
    if (failed) throw new Error('a ride was refused');
    this.failedMs.delete(profileId);
  }
}
