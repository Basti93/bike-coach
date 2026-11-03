import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { applyRecord, type RecordKind, type TrackedRecord } from '../../shared/records';

const MAX_OVERWRITTEN = 200;

type Entry = { record: TrackedRecord; seq: number };
type FileData = { seq: number; entries: Record<string, Entry>; overwritten: TrackedRecord[] };

const empty = (): FileData => ({ seq: 0, entries: {}, overwritten: [] });
const keyOf = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;

const valid = (d: unknown): d is FileData => {
  if (typeof d !== 'object' || d === null) return false;
  const f = d as FileData;
  if (typeof f.seq !== 'number' || !Array.isArray(f.overwritten) || typeof f.entries !== 'object' || f.entries === null || Array.isArray(f.entries)) return false;
  return Object.values(f.entries).every(e => typeof e === 'object' && e !== null && typeof e.seq === 'number'
    && typeof e.record === 'object' && e.record !== null && typeof e.record.kind === 'string' && typeof e.record.id === 'string');
};

/** The Mac's own copy of tracked records, one file per profile. Writes are synchronous: temp file, then rename. */
export class RecordStore {
  private readonly dir: string;
  constructor(opts: { dir: string }) { this.dir = opts.dir; }

  private file(profileId: string): string { return path.join(this.dir, `${encodeURIComponent(profileId)}.json`); }

  private load(profileId: string): FileData {
    const f = this.file(profileId);
    if (!fs.existsSync(f)) return empty();
    // A read error (busy, no permission) is not corruption: let it through, the file is fine.
    const text = fs.readFileSync(f, 'utf8');
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = undefined; }
    if (valid(parsed)) return parsed;
    // A workout must never be lost: move the broken file aside instead of overwriting it.
    // If that fails, throw: carrying on would let the next put overwrite the broken file.
    fs.renameSync(f, `${f}.broken-${Date.now()}-${randomBytes(3).toString('hex')}`);
    // Start the sequence at the clock so a cursor handed out before the break still sees everything new.
    // Persist it now, so a read-only call cannot hand out a cursor the file later falls below.
    const reset: FileData = { ...empty(), seq: Date.now() };
    this.save(profileId, reset);
    return reset;
  }

  private save(profileId: string, data: FileData): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const f = this.file(profileId);
    const fd = fs.openSync(`${f}.tmp`, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(data));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(`${f}.tmp`, f);
  }

  put(profileId: string, r: TrackedRecord): void { this.putMany(profileId, [r]); }

  /** Many records with one load and one save, for bulk imports. */
  putMany(profileId: string, records: TrackedRecord[]): void {
    const data = this.load(profileId);
    let changed = false;
    for (const r of records) {
      const key = keyOf(r);
      const current = data.entries[key]?.record;
      const { keep, overwritten } = applyRecord(current, r);
      if (keep !== current) { data.entries[key] = { record: keep, seq: ++data.seq }; changed = true; }
      if (overwritten) {
        const text = JSON.stringify(overwritten);
        if (!data.overwritten.some(o => JSON.stringify(o) === text)) {
          data.overwritten.push(overwritten);
          if (data.overwritten.length > MAX_OVERWRITTEN) data.overwritten.splice(0, data.overwritten.length - MAX_OVERWRITTEN);
          changed = true;
        }
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

  /** A random value of this profile on this Mac. Lives apart from the records, so it never reaches the server. */
  localSecret(profileId: string): string {
    const f = `${this.file(profileId)}.secret`;
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    fs.mkdirSync(this.dir, { recursive: true });
    const secret = randomBytes(32).toString('hex');
    fs.writeFileSync(f, secret, { mode: 0o600 });
    return secret;
  }

  /** Copies that lost to a newer one, newest last, at most 200 per profile. */
  overwritten(profileId: string): TrackedRecord[] { return this.load(profileId).overwritten; }
}
