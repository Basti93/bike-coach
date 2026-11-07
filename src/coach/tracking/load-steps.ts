import type { TrackedRecord } from '../../shared/records';
import { loadStepOverrides, type LoadStepOverrides } from '../../shared/loads';
import type { Renames } from '../../shared/studio';

/** The person's own weight-step overrides, per profile (not mirrored: a step belongs to the person's studio). Deleted records mean "learned again". */
export function loadStepsOf(store: { all(profileId: string, kind?: 'loadstep'): TrackedRecord[] }, profileId: string, renames?: Renames): LoadStepOverrides {
  try { return loadStepOverrides(store.all(profileId, 'loadstep'), renames); } catch { return new Map(); }
}
