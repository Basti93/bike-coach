import fs from 'node:fs';
import path from 'node:path';
import type { CoachClientMessage } from '../../shared/coach-protocol';

/** The most keys a clock keeps; past that the oldest stamps go first. */
const MAX_KEYS = 5000;

/**
 * The item a message changes, for "last change wins". Null for a message that only adds (a note, an answer) and so is always applied.
 */
export const changeKey = (m: CoachClientMessage): string | null => {
  switch (m.type) {
    case 'complaint-update': return `complaint:${m.id}`;
    case 'set-ftp': return 'ftp';
    case 'feedback': return `feedback:${m.rideId}`;
    case 'meals-item': return `meal:${m.week}:${m.item}`;
    case 'meals-eater': return `eater:${m.week}:${m.meal}:${m.person}`;
    case 'meals-settings': return 'meals-settings';
    case 'garmin-upload-settings': return 'garmin-upload';
    case 'profile-update': return 'profile';
    default: return null;
  }
};

/** Per account: when each item last changed. A change older than that is skipped, so a queued change never undoes a newer one. */
export class ChangeClock {
  private stamps: Map<string, number> | null = null;

  constructor(private readonly file: string) {}

  private load(): Map<string, number> {
    if (this.stamps) return this.stamps;
    const stamps = new Map<string, number>();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) stamps.set(k, v);
      }
    } catch { /* no clock yet, or a broken one: start empty */ }
    this.stamps = stamps;
    return stamps;
  }

  private save(): void {
    const stamps = this.load();
    if (stamps.size > MAX_KEYS) {
      const oldest = [...stamps.entries()].sort((a, b) => a[1] - b[1]).slice(0, stamps.size - MAX_KEYS);
      for (const [k] of oldest) stamps.delete(k);
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(stamps)), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  /** True when the change at `atMs` is not older than the item's last one; it then becomes the item's last change. */
  admit(key: string, atMs: number): boolean {
    const stamps = this.load();
    const last = stamps.get(key);
    if (last !== undefined && atMs < last) return false;
    if (last !== atMs) { stamps.set(key, atMs); this.save(); }
    return true;
  }
}
