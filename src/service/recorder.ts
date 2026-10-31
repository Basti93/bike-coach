import nodeFs from 'node:fs';
import path from 'node:path';
import type { RideEvent, Sample } from '../shared/sample';

export type RideStatus = 'open' | 'finished' | 'aborted';
export type RideMeta = { rideId: string; profileId: string; sessionId: string; startedAtMs: number; status: RideStatus };
type Fs = typeof nodeFs;

const parseLines = <T>(file: string): T[] => {
  if (!nodeFs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of nodeFs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* abgeschnittene Zeile nach Absturz */ }
  }
  return out;
};

/** Entfernt eine unvollständige letzte Zeile, damit weiteres Anhängen sauber lesbar bleibt. */
const trimPartialLine = (file: string): void => {
  if (!nodeFs.existsSync(file)) return;
  const text = nodeFs.readFileSync(file, 'utf8');
  if (text && !text.endsWith('\n')) nodeFs.truncateSync(file, Buffer.byteLength(text.slice(0, text.lastIndexOf('\n') + 1)));
};

export class RideRecorder {
  private pending: { fd: number; line: string }[] = [];
  private samplesFd: number;
  private eventsFd: number;
  private rideDir: string;

  private constructor(dir: string, private meta: RideMeta, private fs: Fs) {
    this.rideDir = path.join(dir, meta.rideId);
    this.samplesFd = nodeFs.openSync(path.join(this.rideDir, 'samples.jsonl'), 'a');
    this.eventsFd = nodeFs.openSync(path.join(this.rideDir, 'events.jsonl'), 'a');
  }

  static create(dir: string, meta: RideMeta, fs: Fs = nodeFs): RideRecorder {
    nodeFs.mkdirSync(path.join(dir, meta.rideId), { recursive: true });
    const rec = new RideRecorder(dir, meta, fs);
    rec.writeMeta();
    return rec;
  }

  static open(dir: string, rideId: string, fs: Fs = nodeFs): RideRecorder {
    const rideDir = path.join(dir, rideId);
    trimPartialLine(path.join(rideDir, 'samples.jsonl'));
    trimPartialLine(path.join(rideDir, 'events.jsonl'));
    return new RideRecorder(dir, readRide(dir, rideId).meta, fs);
  }

  append(sample: Sample): void { this.write(this.samplesFd, sample); }
  event(e: RideEvent): void { this.write(this.eventsFd, e); }
  hasStorageError(): boolean { return this.pending.length > 0; }
  getMeta(): RideMeta { return this.meta; }

  finish(status: Exclude<RideStatus, 'open'>): void {
    this.flush();
    this.meta = { ...this.meta, status };
    this.writeMeta();
    nodeFs.closeSync(this.samplesFd);
    nodeFs.closeSync(this.eventsFd);
  }

  private write(fd: number, value: unknown): void {
    this.pending.push({ fd, line: `${JSON.stringify(value)}\n` });
    this.flush();
  }

  /** Schreibt in Reihenfolge; was fehlschlägt, bleibt im Speicher und wird beim nächsten Mal erneut versucht. */
  private flush(): void {
    while (this.pending.length) {
      const { fd, line } = this.pending[0];
      try {
        this.fs.writeSync(fd, line);
        this.fs.fsyncSync(fd);
      } catch {
        return;
      }
      this.pending.shift();
    }
  }

  private writeMeta(): void {
    const target = path.join(this.rideDir, 'meta.json');
    nodeFs.writeFileSync(`${target}.tmp`, JSON.stringify(this.meta));
    nodeFs.renameSync(`${target}.tmp`, target);
  }
}

export const readRide = (dir: string, rideId: string): { meta: RideMeta; samples: Sample[]; events: RideEvent[] } => {
  const rideDir = path.join(dir, rideId);
  return {
    meta: JSON.parse(nodeFs.readFileSync(path.join(rideDir, 'meta.json'), 'utf8')) as RideMeta,
    samples: parseLines<Sample>(path.join(rideDir, 'samples.jsonl')),
    events: parseLines<RideEvent>(path.join(rideDir, 'events.jsonl')),
  };
};
