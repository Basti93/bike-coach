import fs from 'node:fs';
import path from 'node:path';
import type { TrackedRecord } from '../../shared/records';

/** What the accepted week plans of a profile are, as a short key: changes when the rider takes a plan. */
export const weekPlanKey = (records: TrackedRecord[]): string =>
  records.filter((r) => r.kind === 'weekplan' && !r.deleted).map((r) => `${r.id}:${r.updatedMs}`).sort().join(',');

/**
 * Remembers per profile which week plan the coaches last planned for, in a file, so a restart does not replan. `changed`
 * returns true once for a key it has not seen, also for the first plan ever taken.
 */
export class PlanSeen {
  private seen: Record<string, string> | null = null;
  constructor(private file: string) {}
  private load(): Record<string, string> {
    if (this.seen) return this.seen;
    try { const x = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown; this.seen = x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, string> : {}; } catch { this.seen = {}; }
    return this.seen;
  }
  changed(profileId: string, key: string): boolean {
    const seen = this.load();
    if ((seen[profileId] ?? '') === key) return false;
    seen[profileId] = key;
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const tmp = `${this.file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(seen)); fs.renameSync(tmp, this.file); } catch { /* asked again next scan */ }
    return true;
  }
}
