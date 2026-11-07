import type { TrackedRecord } from '../shared/records';
import { readStudio, resolveStudio, studioId, studioRecord, studioStateOf } from '../shared/studio';
import type { TrackingPort } from './ports';

/** Stamped above what is stored for the id, tombstones included. */
const above = (stored: readonly TrackedRecord[], name: string, nowMs: number): number =>
  Math.max(nowMs, (stored.find((r) => r.kind === 'studio' && r.id === studioId(name))?.updatedMs ?? 0) + 1);

/** A studio is created or picked: it is saved now, so it stays without any workout. The time makes it the default. */
export async function rememberStudio(port: TrackingPort, name: string, nowMs: number): Promise<void> {
  const stored = await port.list('studio');
  await port.put(studioRecord(name, nowMs, above(stored, name, nowMs)));
}

/**
 * `from` is now called `to`. The old name's record points to the new one and the new name gets its own record. A name that
 * already exists (any case) is merged into. Workouts are never rewritten: the records resolve the old name.
 */
export async function renameStudio(port: TrackingPort, from: string, to: string, nowMs: number): Promise<void> {
  const stored = await port.list('studio');
  if (from.toLowerCase() === to.toLowerCase()) { await port.put(studioRecord(to, nowMs, above(stored, to, nowMs))); return; }
  await port.put(studioRecord(from, nowMs, above(stored, from, nowMs), to));
  await port.put(studioRecord(to, nowMs, above(stored, to, nowMs)));
}

/**
 * The studio has workouts, so it stays resolvable but is no longer offered: its record is written again with `hidden`.
 * Picking or creating it again by name brings it back.
 */
export async function hideStudio(port: TrackingPort, name: string, nowMs: number): Promise<void> {
  const stored = await port.list('studio');
  await port.put(studioRecord(name, nowMs, above(stored, name, nowMs), undefined, true));
}

/**
 * A studio without workouts is removed: a tombstone for each of its records (its own and those of names renamed to it).
 * Workouts are never touched; a name that is typed again later is a new studio.
 */
export async function removeStudio(port: TrackingPort, name: string, nowMs: number): Promise<void> {
  const stored = await port.list('studio');
  const { renames } = studioStateOf(stored);
  const key = resolveStudio(name, renames).toLowerCase();
  for (const r of stored) {
    const b = r.kind === 'studio' && !r.deleted ? readStudio(r.body) : null;
    if (b && resolveStudio(b.name, renames).toLowerCase() === key) await port.put({ ...r, deleted: true, updatedMs: Math.max(nowMs, r.updatedMs + 1) });
  }
}
