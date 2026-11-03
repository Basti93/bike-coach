import type { LoggedSet } from '../../shared/records';
import { formatDecimal } from '../session';

type SetType = LoggedSet['type'];

/** Full names, shown in the set type choice. The row itself only shows the short chip. */
export const TYPE_NAMES: Record<SetType, string> = { warmup: 'Aufwärmen', normal: 'Normaler Satz', failure: 'Bis zum Versagen', dropset: 'Dropset' };

/** The chip of each set: A for warmup, F for failure, D for a drop set, otherwise its number. Warmups do not count. */
export function setLabels(sets: { type: SetType }[]): string[] {
  let n = 0;
  return sets.map((x) => {
    if (x.type === 'warmup') return 'A';
    n += 1;
    return x.type === 'failure' ? 'F' : x.type === 'dropset' ? 'D' : String(n);
  });
}

/** Last time's set for each row: warmups against warmups, working sets against working sets, by position. No match is null. */
export function previousSets(sets: { type: SetType }[], last: LoggedSet[]): (LoggedSet | null)[] {
  const warm = last.filter((l) => l.type === 'warmup');
  const work = last.filter((l) => l.type !== 'warmup');
  const seen = { warm: 0, work: 0 };
  return sets.map((x) => (x.type === 'warmup' ? warm[seen.warm++] : work[seen.work++]) ?? null);
}

const lastText = (p: LoggedSet, timed: boolean): string | null => {
  if (timed) return p.durationS !== null ? `${p.durationS} Sek.` : null;
  if (p.weightKg !== null && p.reps !== null) return `${formatDecimal(p.weightKg)} kg × ${p.reps}`;
  if (p.weightKg !== null) return `${formatDecimal(p.weightKg)} kg`;
  if (p.reps !== null) return `${p.reps} Wdh.`;
  return null;
};

/** The small muted line under a set: the planned range and what you did last time. Null when there is nothing to say. */
export function setHint(set: { repRange?: { start: number; end: number } }, previous: LoggedSet | null, timed: boolean): string | null {
  const parts: string[] = [];
  if (set.repRange && !timed) parts.push(`Ziel ${set.repRange.start}–${set.repRange.end}`);
  const last = previous ? lastText(previous, timed) : null;
  if (last) parts.push(`zuletzt ${last}`);
  return parts.length ? parts.join(' · ') : null;
}

/** True when the plan left every weight open: the screen then says "Gewicht nach Gefühl" once, under the title. */
export const exerciseHasNoWeight = (e: { timed?: boolean; sets: { weightKg: number | null }[] }): boolean =>
  !e.timed && e.sets.length > 0 && e.sets.every((x) => x.weightKg === null);
