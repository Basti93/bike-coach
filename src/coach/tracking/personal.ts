import type { TrackedRecord } from '../../shared/records';
import type { Exercise } from '../../shared/exercises';
import { excludedIds, goalOf, migratedRuleId, priorityLine, ruleRecord, wishes, wishLine, RULE_TEXT_MAX, type SportKey, type RuleSport } from '../../shared/personal';

type Reader = { all(profileId: string, kind?: 'rule' | 'goal'): TrackedRecord[] };
type Writer = Reader & { put(profileId: string, r: TrackedRecord): unknown };

/** Read only, like the changes: the coaches never write the person's goal or rules (except the one-time migration below). */
export function goalOfProfile(store: Reader, profileId: string, today: string) {
  try { return goalOf(store.all(profileId, 'goal'), today); } catch { return goalOf([], today); }
}
export function excludedOf(store: Reader, profileId: string, catalog: readonly Pick<Exercise, 'id' | 'family'>[]): Set<string> {
  try { return excludedIds(store.all(profileId, 'rule'), catalog); } catch { return new Set(); }
}
export function wishesOf(store: Reader, profileId: string, sport: SportKey): string[] {
  try { return wishes(store.all(profileId, 'rule'), sport); } catch { return []; }
}

/** The run and bike prompt addition: the sport priorities and the wishes for this sport, one line each. '' when there are none. */
export function personalHint(store: Reader, profileId: string, sport: SportKey, today: string): string {
  const lines = [priorityLine(goalOfProfile(store, profileId, today)), wishLine(wishesOf(store, profileId, sport))].filter((x): x is string => x !== null);
  return lines.length ? `\n${lines.join('\n')}` : '';
}

/**
 * The old free-text rules of a coach become active wishes (source `migrated`). The id comes from sport and text, so a rerun
 * writes nothing new, and a record the person has since paused or deleted (a tombstone is a record too) is left alone.
 */
export function migrateRules(store: Writer, profileId: string, sport: RuleSport, texts: readonly string[], nowMs: number): number {
  let written = 0;
  const have = new Set(store.all(profileId, 'rule').map((r) => r.id));
  for (const raw of texts) {
    const text = typeof raw === 'string' ? raw.trim().slice(0, RULE_TEXT_MAX) : '';
    if (!text) continue;
    const id = migratedRuleId(sport, text);
    if (have.has(id)) continue;
    store.put(profileId, ruleRecord(id, { kind: 'wish', text, sport }, 'active', 'migrated', nowMs));
    have.add(id);
    written++;
  }
  return written;
}
