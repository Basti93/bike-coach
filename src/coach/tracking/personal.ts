import type { TrackedRecord } from '../../shared/records';
import { excludedIds, goalOf, migratedRuleId, ruleRecord, wishes, RULE_TEXT_MAX, type SportKey, type RuleSport } from '../../shared/personal';

type Reader = { all(profileId: string, kind?: 'rule' | 'goal'): TrackedRecord[] };
type Writer = Reader & { put(profileId: string, r: TrackedRecord): unknown };

/** Read only, like the changes: the coaches never write the person's goal or rules (except the one-time migration below). */
export function goalOfProfile(store: Reader, profileId: string) {
  try { return goalOf(store.all(profileId, 'goal')); } catch { return goalOf([]); }
}
export function excludedOf(store: Reader, profileId: string): Set<string> {
  try { return excludedIds(store.all(profileId, 'rule')); } catch { return new Set(); }
}
export function wishesOf(store: Reader, profileId: string, sport: SportKey): string[] {
  try { return wishes(store.all(profileId, 'rule'), sport); } catch { return []; }
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
