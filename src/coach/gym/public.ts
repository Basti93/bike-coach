import type { Complaint } from '../motivation';
import type { GymState } from './state';

type Extra = {
  /** True when the profile has Hevy connected. Only then the workout can go to Hevy. */
  hevy: boolean;
  /** Shared with the bike coach, and open ones only: the same body, so they can be closed from either area. */
  complaints: Complaint[];
  /** Tells "nothing to plan from yet" from "could not plan yet". */
  hasHistory: boolean;
};
export type GymPublic = { state: GymState; thinking: boolean; ready: boolean } & Extra;

/** What the UI sees of the gym coach: nothing until it is enabled (Hevy, a finished own workout, or "Krafttraining starten"). The key never passes through here. */
export const gymPublic = (enabled: boolean, state: GymState, thinking: boolean, ready: boolean, extra: Extra): GymPublic | null =>
  enabled ? { state, thinking, ready, hevy: extra.hevy, hasHistory: extra.hasHistory, complaints: extra.complaints.filter((c) => c.status !== 'over') } : null;
