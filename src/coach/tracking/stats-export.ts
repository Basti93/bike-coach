import { STATS_ID, type StatsBody } from '../../shared/stats';
import type { RecordStore } from './store';

type Deps = {
  store: Pick<RecordStore, 'all' | 'put'>;
  profileIds: string[];
  /** Only the side that coaches a profile writes its stats. */
  coachHere: (profileId: string) => boolean;
  noOpenRide: () => boolean;
  nowMs: number;
  /** null: nothing to show, nothing is written. */
  content: (profileId: string) => Omit<StatsBody, 'atMs'> | null;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Writes the stats record to every profile coached here whose copy would say something new, linked or not. Never with a
 * ride open. Returns the profiles it wrote to; a failure for one profile stays with that profile.
 */
export function exportStats(d: Deps): string[] {
  try {
    if (!d.noOpenRide()) return [];
    const out: string[] = [];
    for (const id of d.profileIds) {
      try {
        if (!d.coachHere(id)) continue;
        const content = d.content(id);
        if (!content) continue;
        const have = d.store.all(id, 'stats').find((r) => r.id === STATS_ID);
        if (have && !have.deleted && isObj(have.body)) {
          const { atMs: _at, ...rest } = have.body;
          if (JSON.stringify(rest) === JSON.stringify(content)) continue;
        }
        d.store.put(id, { kind: 'stats', id: STATS_ID, updatedMs: Math.max(d.nowMs, (have?.updatedMs ?? 0) + 1), deleted: false, body: { ...content, atMs: d.nowMs } });
        out.push(id);
      } catch { /* this profile tries again on the next scan */ }
    }
    return out;
  } catch { return []; }
}
