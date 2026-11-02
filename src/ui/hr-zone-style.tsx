import type { ReactNode } from 'react';
import { hrMaxFor } from '../shared/hr-zones';
import type { StateMessage } from '../shared/protocol';

/** One fixed color per heart rate zone, everywhere. Below zone 1 (0) has no color. */
export const hrZoneColor = (zone: number | null | undefined): string | undefined =>
  zone && zone >= 1 && zone <= 5 ? `var(--hrz${zone})` : undefined;

/** A zone named in text, as a small chip so it stays readable on any background. */
export const ZoneChip = ({ zone, children }: { zone: number; children: ReactNode }) => (
  <span className="hrz-chip" data-zone={zone} style={{ background: hrZoneColor(zone) }}>{children}</span>
);

/** Maximum heart rate of the person riding, if known. */
export const rideHrMax = (state: StateMessage | null, nowMs: number): number | undefined => {
  const profile = state?.profiles.find((p) => p.id === state.ride?.profileId);
  return profile ? hrMaxFor(profile, nowMs)?.bpm : undefined;
};
