import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.hevyapp.com';
const PAGE_SIZE = 10;
const EVENT_INTERVAL_MS = 30 * 60_000;
const RETRY_MS = 30 * 60_000;
const TIMEOUT_MS = 20_000;
const SAFE_ID = /^[A-Za-z0-9-]+$/;

export type StrengthWorkout = {
  id: string; title: string; startMs: number; durationS: number;
  exercises: { title: string; sets: number; reps: number; volumeKg: number }[];
};
type RawWorkout = {
  id: string; title: string; start_time: string; end_time: string;
  exercises: { title: string; sets: { type: string; weight_kg: number | null; reps: number | null }[] }[];
};
type Store = { workouts: Record<string, StrengthWorkout>; nextPage: number | null; syncFromMs: number | null; lastTryMs: number | null };
type Options = { key: string; dir: string; nowMs: () => number; fetchFn?: typeof fetch };

const toWorkout = (w: RawWorkout): StrengthWorkout => {
  const startMs = Date.parse(w.start_time);
  return {
    id: w.id, title: w.title, startMs, durationS: Math.max(0, Math.round((Date.parse(w.end_time) - startMs) / 1000)),
    exercises: w.exercises.map((e) => {
      const work = e.sets.filter((s) => s.type !== 'warmup');
      return {
        title: e.title, sets: work.length,
        reps: work.reduce((a, s) => a + (s.reps ?? 0), 0),
        volumeKg: Math.round(work.reduce((a, s) => a + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)),
      };
    }),
  };
};

class Rejected extends Error {}

/** Reads strength training from Hevy into a local file. Read only, and the key is never stored. */
export class HevySync {
  private store: Store;
  private rejected = false;
  private running = false;
  private file: string;

  constructor(private opts: Options) {
    this.file = path.join(opts.dir, 'workouts.json');
    this.store = this.load();
  }

  private load(): Store {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Store;
      if (s && typeof s.workouts === 'object') return s;
    } catch { /* start over */ }
    return { workouts: {}, nextPage: 1, syncFromMs: null, lastTryMs: null };
  }

  private save(): void {
    fs.mkdirSync(this.opts.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.store), { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
  }

  workouts(): StrengthWorkout[] { return Object.values(this.store.workouts).sort((a, b) => a.startMs - b.startMs); }

  private async get<T>(pathAndQuery: string): Promise<T> {
    const res = await (this.opts.fetchFn ?? fetch)(`${API}${pathAndQuery}`, {
      method: 'GET', headers: { 'api-key': this.opts.key, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) throw new Rejected();
    if (!res.ok) throw new Error(`Hevy ${res.status}`);
    return await res.json() as T;
  }

  private async firstRunPage(page: number): Promise<boolean> {
    const startedMs = this.opts.nowMs();
    const data = await this.get<{ page_count: number; workouts: RawWorkout[] }>(`/v1/workouts?page=${page}&pageSize=${PAGE_SIZE}`);
    for (const w of data.workouts) this.store.workouts[w.id] = toWorkout(w);
    this.store.syncFromMs ??= startedMs;
    const done = page >= data.page_count;
    this.store.nextPage = done ? null : page + 1;
    // Only the finished history is worth planning anew, not every page of it.
    return done;
  }

  private async changes(): Promise<boolean> {
    const since = new Date(this.store.syncFromMs ?? 0).toISOString();
    const startedMs = this.opts.nowMs();
    let changed = false;
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount) {
      const data = await this.get<{ page_count: number; events: ({ type: 'updated'; workout: RawWorkout } | { type: 'deleted'; id: string })[] }>(
        `/v1/workouts/events?page=${page}&pageSize=${PAGE_SIZE}&since=${encodeURIComponent(since)}`);
      for (const e of data.events) {
        if (e.type === 'updated') { this.store.workouts[e.workout.id] = toWorkout(e.workout); changed = true; }
        if (e.type === 'deleted' && this.store.workouts[e.id]) { delete this.store.workouts[e.id]; changed = true; }
      }
      pageCount = data.page_count;
      page += 1;
    }
    this.store.syncFromMs = startedMs;
    return changed;
  }

  /** One small step. True when the coach has something new. Hevy being away changes nothing else. */
  async tick(): Promise<boolean> {
    const now = this.opts.nowMs();
    const { nextPage, lastTryMs } = this.store;
    if (this.rejected || this.running) return false;
    if (nextPage === null && lastTryMs !== null && now - lastTryMs < EVENT_INTERVAL_MS) return false;
    if (nextPage !== null && this.failedAtMs !== null && now - this.failedAtMs < RETRY_MS) return false;
    this.running = true;
    try {
      const changed = nextPage === null ? await this.changes() : await this.firstRunPage(nextPage);
      this.store.lastTryMs = now;
      this.failedAtMs = null;
      this.save();
      return changed;
    } catch (e) {
      if (e instanceof Rejected) this.rejected = true;
      this.failedAtMs = now;
      this.store.lastTryMs = now;
      try { this.save(); } catch { /* try again on the next run */ }
      return false;
    } finally {
      this.running = false;
    }
  }

  private failedAtMs: number | null = null;
}

const parseEnv = (text: string): Record<string, string> => Object.fromEntries(
  text.split('\n').flatMap((line) => {
    const m = /^\s*([A-Z_]+)=(.*)$/.exec(line);
    return m ? [[m[1], m[2].trim()]] : [];
  }),
);
const readText = (file: string): string => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

/** Optional: without a key and a profile there is simply no Hevy. The key belongs to one person, so it needs both. */
export const readHevyConfig = (files: { envFile: string; configFile: string }, env: Record<string, string | undefined>): { key: string; profileId: string } | null => {
  const dotEnv = parseEnv(readText(files.envFile));
  let config: { hevyApiKey?: unknown; hevyProfileId?: unknown } = {};
  try { config = JSON.parse(readText(files.configFile)) as typeof config; } catch { /* no file, no values */ }
  const key = env.HEVY_API_KEY || dotEnv.HEVY_API_KEY || (typeof config.hevyApiKey === 'string' ? config.hevyApiKey : '');
  const profileId = env.HEVY_PROFILE_ID || dotEnv.HEVY_PROFILE_ID || (typeof config.hevyProfileId === 'string' ? config.hevyProfileId : '');
  return key && SAFE_ID.test(profileId) ? { key, profileId } : null;
};
