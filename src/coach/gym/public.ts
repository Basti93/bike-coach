import type { HevyStatus } from '../../shared/coach-protocol';
import type { Complaint } from '../motivation';
import type { GymState } from './state';

type Extra = {
  /** Shared with the bike coach, and open ones only: the same body, so they can be closed from either area. */
  complaints: Complaint[];
  /** Tells "nothing to plan from yet" from "could not plan yet". */
  hasHistory: boolean;
};
export type GymPublic = { state: GymState; thinking: boolean; ready: boolean } & Extra;

/** What the UI sees of the gym coach: nothing without a Hevy connection. The key never passes through here. */
export const gymPublic = (status: HevyStatus, state: GymState, thinking: boolean, ready: boolean, extra: Extra): GymPublic | null =>
  status.state === 'connected' ? { state, thinking, ready, hasHistory: extra.hasHistory, complaints: extra.complaints.filter((c) => c.status !== 'over') } : null;
