import type { TrackedRecord } from '../shared/records';
import { studioId, studioRecord } from '../shared/studio';
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
