import { applyRecord, type TrackedRecord } from '../../shared/records';
import type { RecordStore } from './store';

/**
 * The household shares one exercise catalog, but records are kept per profile. For every `exercise` record id, the winning
 * version (`applyRecord`: newer first) is put to each profile that lacks it or holds a losing one. Deletions are records
 * and mirror as they are. Touches no other kind. Returns the profiles that received records; a second run returns [].
 * A failure for one profile stays with that profile and is tried again on the next run.
 */
export function mirrorExercises(store: Pick<RecordStore, 'all' | 'putMany'>, profileIds: string[]): string[] {
  const ids = [...new Set(profileIds)];
  if (ids.length < 2) return [];
  const have = new Map<string, Map<string, TrackedRecord>>();
  const best = new Map<string, TrackedRecord>();
  for (const p of ids) {
    const mine = new Map<string, TrackedRecord>();
    try { for (const r of store.all(p, 'exercise')) mine.set(r.id, r); } catch { /* this profile is skipped */ }
    have.set(p, mine);
    for (const r of mine.values()) best.set(r.id, applyRecord(best.get(r.id), r).keep);
  }
  const touched: string[] = [];
  for (const p of ids) {
    const mine = have.get(p)!;
    const missing = [...best.values()].filter((b) => {
      const cur = mine.get(b.id);
      return JSON.stringify(applyRecord(cur, b).keep) !== JSON.stringify(cur);
    });
    if (missing.length === 0) continue;
    try { store.putMany(p, missing, 'import'); touched.push(p); } catch { /* next run */ }
  }
  return touched;
}
