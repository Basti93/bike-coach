import fs from 'node:fs';
import path from 'node:path';
import { exerciseTitles, type Exercise, type ExerciseProposal } from '../../shared/exercises';
import { readStats, STATS_ID } from '../../shared/stats';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';
import { resolveExercise } from '../../tracking/exercise-identity';
import { EQUIPMENT, MUSCLES, TYPES } from '../../tracking/ui/labels';
import type { RecordStore } from '../tracking/store';
import { buildMapperPrompt, mapperAnswerSchema, mapperItemSchema, mapperJsonSchema, MAPPER_SYSTEM_PROMPT, type MapperItem } from './exercise-mapper-prompt';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 180;
const MAX_TITLES = 20;
const MAX_CANDIDATES = 12;
/** A title the AI could not place (unsure, or dropped as invalid) waits this long before it is asked again; a failed or unanswered call only waits a day. */
const UNPLACED_RETRY_MS = 7 * DAY_MS;
/** After a failed AI call (timeout, limit, offline) the mapper stays quiet this long. */
const COOLDOWN_MS = 3_600_000;
/** Without a change in the records, a profile is scanned again after this long (asked titles may be due again). */
const RESCAN_MS = DAY_MS;

class NoAsk extends Error {}

type Ask = (input: { prompt: string; systemPrompt: string; schema: object }) => Promise<unknown>;
type Deps = { store: Pick<RecordStore, 'all' | 'putMany'>; ask: Ask; nowMs: () => number; catalog: (profileId: string) => Exercise[]; dir: string; /** False while a ride is open or coaches may not run: no AI call is started then. */ mayAsk: () => boolean };
export type MapperState = { asked: Record<string, number>; undone: string[] };

const stateFile = (dir: string): string => path.join(dir, 'exercise-mapper.json');
function loadState(dir: string): MapperState {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(dir), 'utf8')) as Partial<MapperState>;
    const asked = s.asked && typeof s.asked === 'object' && !Array.isArray(s.asked) ? Object.fromEntries(Object.entries(s.asked).filter(([, v]) => typeof v === 'number')) : {};
    return { asked, undone: Array.isArray(s.undone) ? s.undone.filter((t): t is string => typeof t === 'string') : [] };
  } catch { return { asked: {}, undone: [] }; }
}
function saveState(dir: string, s: MapperState): void {
  fs.mkdirSync(dir, { recursive: true });
  const f = stateFile(dir);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(s));
  fs.renameSync(`${f}.tmp`, f);
}

/** Small deterministic FNV-1a hash, hex. Only names a proposal record after its title. */
export function titleHash(title: string): string {
  let h = 0x811c9dc5;
  for (const ch of title) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const proposalId = (title: string): string => `prop-${titleHash(title)}`;

const words = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));

/** The catalog entries whose titles share the most words with `title`; ties keep catalog order, so it is deterministic. */
export function candidatesFor(title: string, catalog: Exercise[]): Exercise[] {
  const mine = words(title);
  return catalog
    .map((e, i) => {
      const theirs = new Set(exerciseTitles(e).flatMap((t) => [...words(t)]));
      let n = 0;
      for (const w of mine) if (theirs.has(w)) n += 1;
      return { e, i, n };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.e);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Classifies logged exercise titles the catalog does not know, once, by AI. Stores overlays (sure) and proposals (to confirm); never touches a workout. */
export class ExerciseMapper {
  constructor(private deps: Deps) {}

  /** True when records were written. Never throws. Returns false at once while a run is in flight (no queue) or after a failed AI call (1 h cooldown). */
  async run(profileId: string): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try { return await this.runInner(profileId); } catch { return false; } finally { this.running = false; }
  }
  private running = false;
  private coolUntil = 0;
  private scanned = new Map<string, { key: string; atMs: number }>();

  /** Cheap change marker of what the scan reads: count and newest update of workout and exercise records. */
  private fingerprint(profileId: string): string {
    const part = (kind: 'workout' | 'exercise'): string => {
      const all = this.deps.store.all(profileId, kind);
      return `${all.length}:${all.reduce((m, r) => Math.max(m, r.updatedMs), 0)}`;
    };
    return `${part('workout')}|${part('exercise')}`;
  }

  private unresolved(profileId: string, catalog: Exercise[], state: MapperState, now: number): string[] {
    const records = this.deps.store.all(profileId, 'workout');
    const stats = readStats(this.deps.store.all(profileId, 'stats').find((r) => r.id === STATS_ID && !r.deleted)?.body);
    const known = new Set<string>();
    const live = new Set<string>(); // a confirmed new exercise keeps its proposal id: never overwrite it with a fresh proposal
    for (const r of this.deps.store.all(profileId, 'exercise')) {
      if (!r.deleted) live.add(r.id);
      const p = isObj(r.body) && isObj(r.body.proposal) ? r.body.proposal : null;
      if (p && typeof p.forTitle === 'string') known.add(p.forTitle);
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const r of records) {
      const w = r.body as LoggedWorkout | null;
      if (r.deleted || !w || !Array.isArray(w.exercises) || typeof w.startMs !== 'number' || now - w.startMs > WINDOW_DAYS * DAY_MS) continue;
      for (const e of w.exercises) {
        if (!e || typeof e.title !== 'string') continue;
        const title = e.title.trim();
        if (!title || seen.has(title)) continue;
        seen.add(title);
        if (resolveExercise({ exerciseId: typeof e.exerciseId === 'string' ? e.exerciseId : '', title }, catalog, stats?.muscles).exercise) continue;
        if (known.has(title) || live.has(proposalId(title))) continue;
        const at = state.asked[title];
        if (at !== undefined && now - at < DAY_MS) continue;
        out.push(title);
      }
    }
    return out.slice(0, MAX_TITLES);
  }

  private async runInner(profileId: string): Promise<boolean> {
    const now = this.deps.nowMs();
    if (now < this.coolUntil) return false;
    const key = this.fingerprint(profileId);
    const last = this.scanned.get(profileId);
    if (last && last.key === key && now - last.atMs < RESCAN_MS) return false;
    const catalog = this.deps.catalog(profileId);
    const state = loadState(this.deps.dir);
    const titles = this.unresolved(profileId, catalog, state, now);
    if (titles.length === 0) { this.scanned.set(profileId, { key, atMs: now }); return false; }
    const asked = titles.map((title) => ({ title, candidates: candidatesFor(title, catalog) }));
    const wanted = new Set(titles);
    const call = (rejection?: string) => {
      if (!this.deps.mayAsk()) throw new NoAsk();
      return this.deps.ask({ prompt: buildMapperPrompt({ titles: asked, rejection }), systemPrompt: MAPPER_SYSTEM_PROMPT, schema: mapperJsonSchema });
    };
    const parse = (raw: unknown): { items: unknown[] } | string => {
      const r = mapperAnswerSchema.safeParse(raw);
      return r.success ? r.data : r.error.message.slice(0, 300);
    };
    let answer: { items: unknown[] } | string;
    try {
      answer = parse(await call());
      if (typeof answer === 'string') answer = parse(await call(answer));
    } catch (e) {
      // No AI (timeout, limit, offline): nothing written; the whole mapper waits an hour. A ride that opened only stops the call quietly.
      if (!(e instanceof NoAsk)) this.coolUntil = now + COOLDOWN_MS;
      return false;
    }
    if (typeof answer === 'string') {
      // An answer arrived but stays unreadable: wait a day instead of asking again on every scan.
      const fresh = loadState(this.deps.dir);
      for (const t of titles) fresh.asked[t] = Math.max(fresh.asked[t] ?? 0, now);
      saveState(this.deps.dir, fresh);
      this.scanned.set(profileId, { key, atMs: now });
      return false;
    }

    const valid: MapperItem[] = [];
    for (const raw of answer.items) {
      const p = mapperItemSchema.safeParse(raw);
      if (p.success && wanted.has(p.data.title) && this.accepts(p.data, asked.find((a) => a.title === p.data.title)?.candidates ?? [])) valid.push(p.data);
    }
    const existing = new Map(this.deps.store.all(profileId, 'exercise').map((r) => [r.id, r]));
    const records: TrackedRecord[] = [];
    // The app writes an undone title into the overlay (`undoneTitles`), so it travels with the records to every profile.
    const undone = new Set(state.undone);
    for (const r of existing.values()) if (isObj(r.body) && Array.isArray(r.body.undoneTitles)) for (const t of r.body.undoneTitles) if (typeof t === 'string') undone.add(t);
    const done = new Set<string>();
    const linked = new Set<string>(); // one auto link per target and run, so each stays undoable
    for (const it of valid) {
      if (done.has(it.title)) continue;
      done.add(it.title);
      if (it.decision === 'unsure') continue;
      if (it.decision === 'same') {
        const target = catalog.find((c) => c.id === it.exerciseId)!;
        if (it.confidence === 'high' && !undone.has(it.title) && !linked.has(target.id)) {
          linked.add(target.id);
          const have = existing.get(target.id);
          const body = !have?.deleted && isObj(have?.body) && have.body.proposal === undefined ? have.body : {};
          const aliases = [...new Set([...(Array.isArray(body.aliases) ? body.aliases.filter((a): a is string => typeof a === 'string') : []), it.title])];
          records.push({ kind: 'exercise', id: target.id, updatedMs: Math.max(now, (have?.updatedMs ?? 0) + 1), deleted: false, body: { ...body, id: target.id, aliases, lastAutoLink: { title: it.title, atMs: now } } });
        } else {
          records.push(this.proposal(it.title, { forTitle: it.title, kind: 'same', targetId: target.id, reason: it.reason, atMs: now }, {}, now));
        }
      } else {
        const proposal: ExerciseProposal = { forTitle: it.title, kind: 'new', reason: it.reason, atMs: now };
        records.push(this.proposal(it.title, proposal, {
          title: it.name, type: it.type, primaryMuscle: it.primaryMuscle, equipment: it.equipment, secondaryMuscles: it.secondaryMuscles.filter((m) => m !== it.primaryMuscle),
          description: it.description, source: 'ai',
        }, now));
      }
    }
    // A future timestamp delays the next ask beyond the usual day: unplaced titles wait 7 days.
    const placed = new Set(records.map((r) => (r.body as { proposal?: { forTitle?: string } }).proposal?.forTitle ?? (r.body as { lastAutoLink?: { title?: string } }).lastAutoLink?.title));
    const mentioned = new Set(answer.items.flatMap((x) => (isObj(x) && typeof x.title === 'string' ? [x.title] : [])));
    const marks: Record<string, number> = {};
    for (const t of titles) marks[t] = mentioned.has(t) && !placed.has(t) ? now + UNPLACED_RETRY_MS - DAY_MS : now;
    if (records.length > 0) this.deps.store.putMany(profileId, records);
    const fresh = loadState(this.deps.dir); // another writer (the UI undoing a link) may have changed it meanwhile
    for (const [t, at] of Object.entries(marks)) fresh.asked[t] = Math.max(fresh.asked[t] ?? 0, at);
    for (const [t, at] of Object.entries(fresh.asked)) if (now - at > 30 * DAY_MS) delete fresh.asked[t];
    saveState(this.deps.dir, fresh);
    this.scanned.set(profileId, { key: this.fingerprint(profileId), atMs: now });
    return records.length > 0;
  }

  private accepts(it: MapperItem, candidates: Exercise[]): boolean {
    if (it.decision === 'same') return candidates.some((c) => c.id === it.exerciseId);
    if (it.decision === 'new') {
      return Object.hasOwn(MUSCLES, it.primaryMuscle) && it.secondaryMuscles.every((m) => Object.hasOwn(MUSCLES, m))
        && Object.hasOwn(EQUIPMENT, it.equipment) && Object.hasOwn(TYPES, it.type) && it.name.trim() !== '';
    }
    return true;
  }

  private proposal(title: string, proposal: ExerciseProposal, fields: Record<string, unknown>, now: number): TrackedRecord {
    const id = proposalId(title);
    return { kind: 'exercise', id, updatedMs: now, deleted: false, body: { id, ...fields, proposal } };
  }
}
