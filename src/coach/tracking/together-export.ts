import type { TogetherBody } from '../../shared/together';
import { TOGETHER_ID } from '../../shared/together';
import { weekOf, weekStartMs, type Together } from '../together';
import type { RecordStore } from './store';

type Deps = {
  store: Pick<RecordStore, 'all' | 'put'>;
  /** The household: every profile whose part is in the together view. */
  profileIds: string[];
  linked: (profileId: string) => boolean;
  noOpenRide: () => boolean;
  nowMs: number;
  /** Computed only when at least one profile is linked. */
  together: () => Together;
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * What one account's copy says. Picked field by field, so a field added to the Mac page later never crosses by itself.
 * Left out on purpose: the "who leads" line and streaks (no ranking, no streak pressure).
 */
export const togetherContent = (t: Together, you: string, nowMs: number): Omit<TogetherBody, 'atMs'> => ({
  week: weekStartMs(weekOf(nowMs)), you,
  people: t.people.map((p) => ({ profileId: p.profileId, name: p.name, ridesThisWeek: p.ridesThisWeek, minutesThisWeek: p.minutesThisWeek, wordsLearned: p.wordsLearned, weeks: [...p.weeks] })),
  recent: t.recent.map((r) => ({ name: r.name, startedAtMs: r.startedAtMs, ...(r.sessionName ? { sessionName: r.sessionName } : {}), minutes: r.minutes })),
  metres: t.metres, lastRideMetres: t.lastRideMetres,
  peak: { name: t.peak.name, done: t.peak.done, total: t.peak.total, next: t.peak.next },
  summits: t.summits.map((s) => ({ name: s.name, atMs: s.atMs })),
  climbed: (t.climbed ?? []).map((c) => ({ who: c.who, name: c.name, atMs: c.atMs })),
  climbing: (t.climbing ?? []).map((c) => ({ who: c.who, name: c.name, pct: c.pct })),
});

/**
 * Writes the together record to every linked profile whose copy would say something new. Never with a ride open, never
 * for an unlinked profile. Returns the profiles it wrote to; every failure stays inside.
 */
export function exportTogether(d: Deps): string[] {
  try {
    if (!d.noOpenRide()) return [];
    const ids = d.profileIds.filter((id) => { try { return d.linked(id); } catch { return false; } });
    if (ids.length === 0) return [];
    const t = d.together();
    const out: string[] = [];
    for (const id of ids) {
      try {
        const content = togetherContent(t, id, d.nowMs);
        const have = d.store.all(id, 'together').find((r) => r.id === TOGETHER_ID);
        if (have && !have.deleted && isObj(have.body)) {
          const { atMs: _at, ...rest } = have.body;
          if (JSON.stringify(rest) === JSON.stringify(content)) continue;
        }
        d.store.put(id, { kind: 'together', id: TOGETHER_ID, updatedMs: Math.max(d.nowMs, (have?.updatedMs ?? 0) + 1), deleted: false, body: { ...content, atMs: d.nowMs } });
        out.push(id);
      } catch { /* this profile tries again on the next scan */ }
    }
    return out;
  } catch { return []; }
}
