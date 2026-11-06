import type { TrackedRecord } from '../../shared/records';
import { NO_STUDIOS, studioStateOf, type StudioState } from '../../shared/studio';

/** The person's own studios (renames and remembered picks), per profile, read like the weight-step records. */
export function studiosOf(store: { all(profileId: string, kind?: 'studio'): TrackedRecord[] }, profileId: string): StudioState {
  try { return studioStateOf(store.all(profileId, 'studio')); } catch { return NO_STUDIOS; }
}
