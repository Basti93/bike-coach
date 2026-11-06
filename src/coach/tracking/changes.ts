import type { TrackedRecord } from '../../shared/records';
import { takenChanges, type NextChange } from '../../shared/changes';

/** The changes the rider took for the next workout, oldest first. Read only: the coach never writes or clears them. */
export function takenChangesOf(store: { all(profileId: string, kind?: 'change'): TrackedRecord[] }, profileId: string): NextChange[] {
  try { return takenChanges(store.all(profileId, 'change')); } catch { return []; }
}
