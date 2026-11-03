import type { CoachHome } from '../../shared/coach-protocol';
import type { MigrateResult } from './migrate';

type Problem = Extract<CoachHome, { where: 'moving' }>['problem'];

const MIN_MS = 60_000;
/** A failure that may pass (offline, a cut finish, data that kept changing) is tried at least this often. */
const MAX_TRANSIENT_MS = 15 * 60_000;
/** A refusal that will not pass by itself (too large, unreadable, another profile, the same items missing twice). */
const MAX_REFUSED_MS = 6 * 3_600_000;

type Per = { key: string; tries: number; nextMs: number; records: boolean; problem: Problem };

/**
 * When a profile's move may run again. A failure waits a minute, then twice as long each time it repeats with the same reason:
 * up to 15 minutes when it may pass, up to six hours when it will not. While records are unsettled the move waits for them
 * alone, so nothing is asked of the server and nothing hashed until the account sync settled them.
 */
export class MoveBackoff {
  private per = new Map<string, Per>();
  constructor(private readonly nowMs: () => number = () => Date.now()) {}

  due(profileId: string, settled: () => boolean): boolean {
    const s = this.per.get(profileId);
    if (!s) return true;
    if (s.records) { try { return settled(); } catch { return false; } }
    return this.nowMs() >= s.nextMs;
  }

  /** What stops the move, for the coach view. Null when nothing does. */
  problem(profileId: string): Problem {
    return this.per.get(profileId)?.problem ?? null;
  }

  record(profileId: string, out: MigrateResult): void {
    if (out.state === 'done' || (out.state === 'paused' && out.reason === 'ride')) { this.per.delete(profileId); return; }
    const was = this.per.get(profileId);
    if (out.state === 'paused' && out.reason === 'records') {
      this.per.set(profileId, { key: was?.key ?? '', tries: was?.tries ?? 0, nextMs: 0, records: true, problem: was?.problem ?? null });
      return;
    }
    const key = out.state === 'refused' ? out.reason : `${out.state}:${out.reason}:${'items' in out ? (out.items ?? []).slice().sort().join(',') : ''}`;
    const tries = was?.key === key ? was.tries + 1 : 1;
    let problem: Problem;
    let lasting: boolean;
    if (out.state === 'refused') { problem = 'other-profile'; lasting = true; }
    else if (out.state === 'paused') { problem = 'offline'; lasting = false; }
    else if (out.reason === 'offline' || out.reason === 'changing') { problem = 'offline'; lasting = false; }
    // The same items missing a second time will not pass by themselves.
    else if (out.reason === 'missing') { lasting = tries >= 2; problem = lasting ? 'missing' : 'offline'; }
    else { problem = out.reason; lasting = true; }
    const wait = Math.min(MIN_MS * 2 ** (tries - 1), lasting ? MAX_REFUSED_MS : MAX_TRANSIENT_MS);
    this.per.set(profileId, { key, tries, nextMs: this.nowMs() + wait, records: false, problem });
  }
}
