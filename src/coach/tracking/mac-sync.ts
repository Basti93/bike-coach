import type { AccountStatus } from '../../shared/coach-protocol';
import type { RecordKind, TrackedRecord } from '../../shared/records';
import { syncRecords, type Refusal } from '../../tracking/sync';
import type { Coach } from '../coach';
import type { GymCoach } from '../gym/gym-coach';
import type { MobilityCoach } from '../mobility/mobility';
import type { ComplaintStatus } from '../motivation';
import { finishedOwnWorkout, validRecord } from './records-api';
import { LinkError, type AccountLinks, type LinkFailure } from './link';
import type { RecordStore } from './store';

const MIN_GAP_MS = 60_000;
const SOON_GAP_MS = 5_000;
const TIMEOUT_MS = 15_000;
const PAGE = 200;
const STATUSES: readonly string[] = ['active', 'healing', 'over'];

type Deps = {
  links: AccountLinks; store: RecordStore; nowMs: () => number;
  coach: Pick<Coach, 'state' | 'addComplaintFromText' | 'updateComplaint'>;
  gym: Pick<GymCoach, 'state' | 'enabled' | 'start' | 'workoutFinished'>;
  mobility: Pick<MobilityCoach, 'view'>;
  /** False while a ride is open. Checked before every request. */
  noOpenRide: () => boolean;
  fetchFn?: typeof fetch;
  /** Records from the server were applied. */
  onChange?: (profileId: string) => void;
};

class Rejected extends Error {}
type Per = {
  lastStartMs: number | null; dirty: boolean; running: Promise<void> | null; offline: boolean; lastSyncMs: number | null;
  refused: Set<string>; linking: boolean; failure: LinkFailure | null;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Keeps one profile's tracked records in step with its account on the server. It never runs with a ride open, never
 * overlaps itself per profile, and every failure stays inside: the caller gets no error and nothing else is affected.
 */
export class AccountSync {
  private per = new Map<string, Per>();
  constructor(private deps: Deps) {}

  private st(id: string): Per {
    let s = this.per.get(id);
    if (!s) { s = { lastStartMs: null, dirty: false, running: null, offline: false, lastSyncMs: null, refused: new Set(), linking: false, failure: null }; this.per.set(id, s); }
    return s;
  }

  /** Something changed on this Mac: sync soon, not at the next full minute. */
  touch(profileId: string): void { this.st(profileId).dirty = true; }

  async link(profileId: string, url: string, name: string, password: string): Promise<void> {
    const s = this.st(profileId);
    s.linking = true; s.failure = null;
    try {
      await this.deps.links.link(profileId, url, name, password);
      s.lastStartMs = null; s.offline = false; s.dirty = true;
    } catch (e) {
      s.failure = e instanceof LinkError ? e.reason : 'failed';
    } finally { s.linking = false; }
  }

  unlink(profileId: string): void {
    this.deps.links.unlink(profileId);
    this.per.delete(profileId);
  }

  status(profileId: string): AccountStatus {
    const l = this.deps.links.status(profileId);
    const s = this.st(profileId);
    const state: AccountStatus['state'] = s.linking ? 'linking' : s.failure && l.state === 'idle' ? 'failed' : l.state;
    return { state, name: l.name, reason: s.failure, refused: s.refused.size, offline: s.offline, lastSyncMs: s.lastSyncMs };
  }

  /** Safe to call from the scan loop without awaiting. Never rejects. */
  tick(profileId: string): Promise<void> {
    try {
      if (!this.deps.links.token(profileId)) return Promise.resolve();
      const s = this.st(profileId);
      if (s.running) return s.running;
      const now = this.deps.nowMs();
      if (s.lastStartMs !== null && now - s.lastStartMs < (s.dirty ? SOON_GAP_MS : MIN_GAP_MS)) return Promise.resolve();
      if (!this.deps.noOpenRide()) return Promise.resolve();
      s.lastStartMs = now; s.dirty = false;
      const run: Promise<void> = this.run(profileId).catch(() => {}).finally(() => { if (s.running === run) s.running = null; });
      s.running = run;
      return run;
    } catch { return Promise.resolve(); }
  }

  private async run(id: string): Promise<void> {
    const { links } = this.deps;
    const s = this.st(id);
    const token = links.token(id), url = links.url(id);
    if (!token || !url) return;
    const call = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
      const res = await (this.deps.fetchFn ?? fetch)(`${url}${path}`, {
        method, signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (res.status === 401) throw new Rejected();
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      return res.json();
    };
    try {
      try { this.exportPlan(id); } catch { /* the next run tries again */ }
      try { this.exportComplaints(id); } catch { /* the next run tries again */ }
      await syncRecords({
        cursors: links.cursors(id),
        mayContinue: () => this.deps.noOpenRide() && links.token(id) !== null,
        local: {
          changedSince: async (c) => this.deps.store.changedSince(id, c),
          apply: async (r) => this.applyRemote(id, [r]),
          applyMany: async (rs) => this.applyRemote(id, rs),
        },
        send: async (records) => {
          const out = await call('POST', '/records', { records });
          const refused: Refusal[] = isObj(out) && Array.isArray(out.refused)
            ? out.refused.flatMap((x): Refusal[] => (isObj(x) && typeof x.id === 'string' ? [{ id: x.id, reason: typeof x.reason === 'string' ? x.reason : '' }] : []))
            : [];
          return { refused };
        },
        fetchSince: async (cursor) => {
          const out = await call('GET', `/records?since=${cursor}&limit=${PAGE}`);
          if (!isObj(out) || !Array.isArray(out.records) || typeof out.cursor !== 'number' || !Number.isFinite(out.cursor)) throw new Error('unexpected answer');
          const records = out.records.flatMap((x) => { const r = validRecord(x); return r ? [r] : []; });
          return { records, cursor: out.cursor, more: out.more === true, reset: out.reset === true };
        },
        refused: (list) => { for (const r of list) s.refused.add(r.id); },
      });
      s.offline = false; s.lastSyncMs = this.deps.nowMs();
    } catch (e) {
      if (e instanceof Rejected) { links.reject(id); s.offline = false; } else s.offline = true;
    }
  }

  /** Remote page into the store, then what follows from it. Whatever follows must never undo a kept record. */
  private applyRemote(id: string, incoming: TrackedRecord[]): void {
    const recs = incoming.flatMap((x) => { const r = validRecord(x); return r ? [r] : []; });
    if (recs.length === 0) return;
    const { store } = this.deps;
    const workouts = recs.filter((r) => r.kind === 'workout');
    const before = new Map<string, boolean | null>();
    if (workouts.length > 0) {
      const all = store.all(id, 'workout');
      for (const w of workouts) before.set(w.id, finishedOwnWorkout(all.find((r) => r.id === w.id)));
    }
    store.putMany(id, recs);
    try {
      if (workouts.length > 0) {
        const all = store.all(id, 'workout');
        for (const wid of before.keys()) {
          const done = finishedOwnWorkout(all.find((r) => r.id === wid));
          if (done === null) continue;
          this.deps.gym.start(id);
          // Only the first change from open to finished plans; edits and replays do not.
          if (done && before.get(wid) !== true) this.deps.gym.workoutFinished(id);
        }
      }
    } catch { /* the next scan sees the stored workout anyway */ }
    try { this.importComplaints(id, recs.filter((r) => r.kind === 'complaint')); } catch { /* kept in the store, imported next time */ }
    try { this.deps.onChange?.(id); } catch { /* a listener never matters here */ }
  }

  private importComplaints(id: string, incoming: TrackedRecord[]): void {
    if (incoming.length === 0) return;
    const current = new Map(this.deps.store.all(id, 'complaint').map((r) => [r.id, r]));
    for (const r0 of incoming) {
      const r = current.get(r0.id);
      if (!r || r.deleted || !isObj(r.body)) continue;
      const { text, status, atMs } = r.body;
      if (typeof text !== 'string' || typeof status !== 'string' || !STATUSES.includes(status) || typeof atMs !== 'number' || !Number.isFinite(atMs)) continue;
      const have = (this.deps.coach.state(id).complaints ?? []).find((c) => c.id === r.id);
      if (!have) this.deps.coach.addComplaintFromText(id, text, { id: r.id, status: status as ComplaintStatus, startedMs: atMs, updatedMs: r.updatedMs });
      // Newest wins: the phone's change only applies when it is newer than this Mac's copy.
      else if (r.updatedMs > have.updatedMs && have.status !== status) this.deps.coach.updateComplaint(id, r.id, status as ComplaintStatus, r.updatedMs);
    }
  }

  /** The plan as a record, written only when what it says has changed. */
  private exportPlan(id: string): void {
    const { gym, store } = this.deps;
    if (!gym.enabled(id)) return;
    const g = gym.state(id);
    if (!g.next) return;
    let mobility: unknown = null;
    try { mobility = this.deps.mobility.view(id).session; } catch { /* no offer then */ }
    const content = { workout: g.next.workout, reason: g.next.reason, source: g.next.source, note: g.lastNote?.text ?? null, questions: g.lastNote?.questions ?? [] };
    const have = store.all(id, 'plan').find((r) => r.id === 'current');
    if (have && !have.deleted && isObj(have.body)) {
      const { atMs: _at, mobility: m, ...rest } = have.body;
      if (JSON.stringify(rest) === JSON.stringify(content) && JSON.stringify(m ?? null) === JSON.stringify(mobility)) return;
    }
    const now = this.deps.nowMs();
    store.put(id, { kind: 'plan', id: 'current', updatedMs: Math.max(now, (have?.updatedMs ?? 0) + 1), deleted: false, body: { ...content, atMs: now, mobility } });
  }

  /** The bike coach's complaints as records. The id is the complaint's own, so a copy coming back is the same complaint. */
  private exportComplaints(id: string): void {
    const { store, coach } = this.deps;
    const have = new Map(store.all(id, 'complaint').map((r) => [r.id, r]));
    const out: TrackedRecord[] = [];
    for (const c of coach.state(id).complaints ?? []) {
      const body = { text: c.text, status: c.status, atMs: c.startedMs };
      const r = have.get(c.id);
      if (r && (r.updatedMs > c.updatedMs || (!r.deleted && JSON.stringify(r.body) === JSON.stringify(body)))) continue;
      out.push({ kind: 'complaint' as RecordKind, id: c.id, updatedMs: c.updatedMs, deleted: false, body });
    }
    if (out.length > 0) store.putMany(id, out);
  }
}
