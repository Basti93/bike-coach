import type { StrengthWorkout } from '../hevy';
import { strengthHealth, type StrengthHealth } from '../strength';

type Source = (id: string) => StrengthWorkout[];

/** What the bike coach sees: the merged history. If the local store cannot be read, Hevy's list as it was before. */
export const mergedStrength = (history: Source, hevy: Source): Source => (id) => {
  try { return history(id); } catch { return hevy(id); }
};

/** The health page's strength card. Null for a profile without Hevy and without any workout: nothing new appears there. */
export const mergedHealth = (d: { history: Source; connected: (id: string) => boolean; nowMs: () => number }) => (id: string): StrengthHealth | null => {
  const workouts = d.history(id);
  return d.connected(id) || workouts.length > 0 ? strengthHealth(workouts, d.nowMs()) : null;
};
