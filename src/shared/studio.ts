import { z } from 'zod';
import type { LoggedWorkout, TrackedRecord } from './records';
import { titleHash } from './exercise-links';

/** The studio is where a workout was done; weights depend on its equipment. Pure, shared by app and coach. */
type WithStudio = Pick<LoggedWorkout, 'startMs'> & { studio?: string; id?: string };

export const STUDIO_MAX = 40;

/** A typed name: trimmed, at most 40 characters; nothing left means no studio. */
export function studioName(raw: string): string | undefined {
  const n = raw.trim().slice(0, STUDIO_MAX).trim();
  return n === '' ? undefined : n;
}

// --- the person's own studios: record kind `studio` ---

/** Renames by lowercased old name to the new name. */
export type Renames = ReadonlyMap<string, string>;
export type StudioPick = { name: string; atMs: number };
/** What the `studio` records say: renames, and the names remembered with the time they were created or picked. */
/** `hidden`: lowercased names the person put away; they are not offered, but old workouts still resolve to them. */
export type StudioState = { renames: Renames; picks: readonly StudioPick[]; hidden: ReadonlySet<string> };
export const NO_STUDIOS: StudioState = { renames: new Map(), picks: [], hidden: new Set() };

const lower = (n: string): string => n.toLowerCase();

/**
 * The name a studio goes by now: renames are followed along their chain. A cycle (two devices renaming against each other)
 * ends at the smallest name of the cycle, so every device agrees.
 */
export function resolveStudio(name: string, renames: Renames = new Map()): string {
  const seen: string[] = [];
  let cur = name;
  for (;;) {
    const next = renames.get(lower(cur));
    if (next === undefined || lower(next) === lower(cur)) return cur;
    if (seen.includes(lower(cur))) return seen.map((k) => renames.get(k) ?? k).reduce((a, b) => (lower(b) < lower(a) ? b : a));
    seen.push(lower(cur));
    cur = next;
  }
}

const bodySchema = z.object({ name: z.string().min(1).max(STUDIO_MAX), renamedTo: z.string().min(1).max(STUDIO_MAX).optional(), hidden: z.boolean().optional(), atMs: z.number().finite() });
export type StudioBody = z.infer<typeof bodySchema>;
export const studioId = (name: string): string => `studio-${titleHash(lower(name))}`;

/** The body of a `studio` record, or null for anything else. */
export function readStudio(body: unknown): StudioBody | null {
  const p = bodySchema.safeParse(body);
  return p.success ? p.data : null;
}

export const studioRecord = (name: string, atMs: number, updatedMs: number, renamedTo?: string, hidden?: boolean): TrackedRecord =>
  ({ kind: 'studio', id: studioId(name), updatedMs, deleted: false, body: { name, ...(renamedTo ? { renamedTo } : {}), ...(hidden ? { hidden: true } : {}), atMs } });

/** Live, readable `studio` records. Deleted (forgotten) and malformed ones count for nothing. */
export function studioStateOf(records: readonly TrackedRecord[]): StudioState {
  const renames = new Map<string, string>();
  const picks: StudioPick[] = [];
  const hidden = new Set<string>();
  for (const r of records) {
    if (r.kind !== 'studio' || r.deleted) continue;
    const b = readStudio(r.body);
    if (!b) continue;
    if (b.renamedTo) renames.set(lower(b.name), b.renamedTo);
    else if (b.hidden) hidden.add(lower(b.name));
    else picks.push({ name: b.name, atMs: b.atMs });
  }
  return { renames, picks, hidden };
}

/** The studio of the earliest workout that has one. Undefined while no workout has a studio. */
export function mainStudio(workouts: readonly WithStudio[], renames: Renames = new Map()): string | undefined {
  let main: WithStudio | undefined;
  // A tie on the start is broken by id, so every device agrees.
  for (const w of workouts) {
    if (w.studio && (!main || w.startMs < main.startMs || (w.startMs === main.startMs && (w.id ?? '') < (main.id ?? '')))) main = w;
  }
  return main?.studio ? resolveStudio(main.studio, renames) : undefined;
}

/** The bucket a workout counts for: its own studio, else the main one (old workouts, Hevy imports), else one shared bucket (''). Renames applied. */
export const studioKey = (w: { studio?: string }, main: string | undefined, renames: Renames = new Map()): string =>
  w.studio ? resolveStudio(w.studio, renames) : (main ?? '');

/** Names this profile knows, newest first: remembered studios and those of workouts, renames applied, once each ignoring case. Hidden ones are left out. */
export function knownStudios(workouts: readonly WithStudio[], renames: Renames = new Map(), picks: readonly StudioPick[] = [], hidden: ReadonlySet<string> = new Set()): string[] {
  const all = [...workouts.filter((w) => w.studio).map((w) => ({ name: w.studio as string, ms: w.startMs })), ...picks.map((p) => ({ name: p.name, ms: p.atMs }))]
    .sort((a, b) => b.ms - a.ms);
  const seen = new Map<string, string>();
  for (const x of all) { const n = resolveStudio(x.name, renames); if (!seen.has(lower(n))) seen.set(lower(n), n); }
  return [...seen.values()].filter((n) => !hidden.has(lower(n)));
}

/** The newest of the newest own (not Hevy) workout's studio and the newest remembered pick; undefined when none is known. */
export function defaultStudio(workouts: readonly (WithStudio & { source: LoggedWorkout['source'] })[], renames: Renames = new Map(), picks: readonly StudioPick[] = []): string | undefined {
  const own = workouts.filter((w) => w.source === 'pandafit');
  const newest = own.reduce<(typeof own)[number] | null>((a, w) => (!a || w.startMs > a.startMs ? w : a), null);
  const pick = picks.reduce<StudioPick | null>((a, p) => (!a || p.atMs > a.atMs ? p : a), null);
  if (pick && (!newest || pick.atMs > newest.startMs)) return resolveStudio(pick.name, renames);
  return newest ? studioKey(newest, mainStudio(workouts, renames), renames) || undefined : undefined;
}
