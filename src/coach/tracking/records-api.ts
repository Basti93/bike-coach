import type { CoachClientMessage, CoachServerMessage } from '../../shared/coach-protocol';
import type { RecordKind, TrackedRecord } from '../../shared/records';
import type { RecordStore } from './store';

export const RECORD_KINDS: readonly RecordKind[] = ['workout', 'routine', 'exercise', 'mobility', 'complaint', 'plan'];
export const MAX_BODY_BYTES = 1_000_000;

/** A record as the store may keep it. Extra body fields stay, everything else is cut to the known shape. */
export function validRecord(x: unknown): TrackedRecord | null {
  if (typeof x !== 'object' || x === null) return null;
  const r = x as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !RECORD_KINDS.includes(r.kind as RecordKind)) return null;
  if (typeof r.id !== 'string' || r.id === '' || r.id.length > 200) return null;
  if (typeof r.updatedMs !== 'number' || !Number.isFinite(r.updatedMs)) return null;
  if (typeof r.deleted !== 'boolean') return null;
  let text: string | undefined;
  try { text = JSON.stringify(r.body); } catch { return null; }
  if (text === undefined || Buffer.byteLength(text) > MAX_BODY_BYTES) return null;
  return { kind: r.kind as RecordKind, id: r.id, updatedMs: r.updatedMs, deleted: r.deleted, body: r.body };
}

type Deps = {
  store: Pick<RecordStore, 'put' | 'all'>;
  gym: { start(id: string): void; workoutFinished(id: string): void };
};
type Result = { reply: CoachServerMessage; changed?: string };

const finishedOwnWorkout = (r: TrackedRecord): boolean | null => {
  if (r.kind !== 'workout' || r.deleted || typeof r.body !== 'object' || r.body === null) return null;
  const b = r.body as { endMs?: unknown; source?: unknown };
  if (b.source === 'hevy') return null;
  return typeof b.endMs === 'number' && Number.isFinite(b.endMs);
};

/** Local reads and writes only: no AI, no Hevy, no Garmin, so also fine with a ride open. */
export function handleRecords(deps: Deps, m: Extract<CoachClientMessage, { type: 'records-put' | 'records-list' }>): Result {
  const profileOk = typeof m.profileId === 'string' && m.profileId !== '';
  if (m.type === 'records-list') {
    const kind = RECORD_KINDS.includes(m.kind) ? m.kind : null;
    const records = profileOk && kind ? deps.store.all(m.profileId, kind) : [];
    return { reply: { type: 'records', requestId: m.requestId, kind: m.kind, records } };
  }
  const record = profileOk ? validRecord(m.record) : null;
  if (!record) return { reply: { type: 'records-put-result', requestId: m.requestId, ok: false, refused: true } };
  try { deps.store.put(m.profileId, record); } catch { return { reply: { type: 'records-put-result', requestId: m.requestId, ok: false } }; }
  // Stored, so the answer may go out. What follows is bookkeeping and must not turn a kept record into a failure.
  try {
    const finished = finishedOwnWorkout(record);
    if (finished !== null) { deps.gym.start(m.profileId); if (finished) deps.gym.workoutFinished(m.profileId); }
  } catch { /* the next scan sees the stored workout anyway */ }
  return { reply: { type: 'records-put-result', requestId: m.requestId, ok: true }, changed: m.profileId };
}
