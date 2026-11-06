import type { TrackedRecord } from '../../shared/records';
import { loadStepOverrides, type LoadStepOverrides } from '../../shared/loads';

/** The person's own weight-step overrides, per profile (not mirrored: a step belongs to the person's studio). Deleted records mean "learned again". */
export function loadStepsOf(store: { all(profileId: string, kind?: 'loadstep'): TrackedRecord[] }, profileId: string): LoadStepOverrides {
  try { return loadStepOverrides(store.all(profileId, 'loadstep')); } catch { return new Map(); }
}
