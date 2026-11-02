import type { HevyStatus } from '../../shared/coach-protocol';
import type { GymState } from './state';

export type GymPublic = { state: GymState; thinking: boolean; ready: boolean };

/** What the UI sees of the gym coach: nothing without a Hevy connection. The key never passes through here. */
export const gymPublic = (status: HevyStatus, state: GymState, thinking: boolean, ready: boolean): GymPublic | null =>
  status.state === 'connected' ? { state, thinking, ready } : null;
