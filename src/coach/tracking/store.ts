import fs from 'node:fs';
import path from 'node:path';
import { applyRecord, type RecordKind, type TrackedRecord } from '../../shared/records';

const MAX_OVERWRITTEN = 200;

type Entry = { record: TrackedRecord; seq: number };
type FileData = { seq: number; entries: Record<string, Entry>; overwritten: TrackedRecord[] };

const empty = (): FileData => ({ seq: 0, entries: {}, overwritten: [] });
const keyOf = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;

const valid = (d: unknown): d is FileData => {
  if (typeof d !== 'object' || d === null) return false;
  const f = d as FileData;
  return typeof f.seq === 'number' && Array.isArray(f.overwritten) && typeof f.entries === 'object' && f.entries !== null && !Array.isArray(f.entries);
};

/** The Mac's own copy of tracked records, one file per profile. Writes are synchronous: temp file, then rename. */
export class RecordStore {
  private readonly dir: string;
  constructor(opts: { dir: string }) { this.dir = opts.dir; }

  private file(profileId: string): string { return path.join(this.dir, `${encodeURIComponent(profileId)}.json`); }

  private load(profileId: string): FileData {
    const f = this.file(profileId);
    if (!fs.existsSync(f)) return empty();
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (!valid(parsed)) throw new Error('not a record file');
      return parsed;
    } catch {
      // A workout must never be lost: move the broken file aside instead of overwriting it.
      try { fs.renameSync(f, `${f}.broken-${Date.now()}`); } catch { /* start empty anyway */ }
      return empty();
    }
  }

  private save(profileId: string, data: FileData): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const f = this.file(profileId);
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(data));
    fs.renameSync(`${f}.tmp`, f);
  }

  put(profileId: string, r: TrackedRecord): void {
    const data = this.load(profileId);
    const key = keyOf(r);
    const current = data.entries[key]?.record;
    const { keep, overwritten } = applyRecord(current, r);
    let changed = false;
    if (keep !== current) { data.entries[key] = { record: keep, seq: ++data.seq }; changed = true; }
    if (overwritten) {
      const text = JSON.stringify(overwritten);
      if (!data.overwritten.some(o => JSON.stringify(o) === text)) {
        data.overwritten.push(overwritten);
        data.overwritten = data.overwritten.slice(-MAX_OVERWRITTEN);
        changed = true;
      }
    }
    if (changed) this.save(profileId, data);
  }

  all(profileId: string, kind?: RecordKind): TrackedRecord[] {
    return Object.values(this.load(profileId).entries).map(e => e.record).filter(r => !kind || r.kind === kind);
  }

  changedSince(profileId: string, cursor: number): { records: TrackedRecord[]; cursor: number } {
    const data = this.load(profileId);
    const records = Object.values(data.entries).filter(e => e.seq > cursor).sort((a, b) => a.seq - b.seq).map(e => e.record);
    return { records, cursor: data.seq };
  }

  /** Copies that lost to a newer one, newest last, at most 200 per profile. */
  overwritten(profileId: string): TrackedRecord[] { return this.load(profileId).overwritten; }
}
