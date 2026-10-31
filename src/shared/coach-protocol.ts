import type { CoachState, Rating } from '../coach/state';

export type CoachClientMessage =
  | { type: 'subscribe'; profileId: string }
  | { type: 'feedback'; profileId: string; rideId: string; rating: Rating }
  | { type: 'skip-feedback'; profileId: string }
  | { type: 'note'; profileId: string; text: string }
  | { type: 'adjust'; profileId: string; how: 'easier' | 'harder' | 'shorter' };
export type CoachServerMessage = { type: 'coach-state'; state: CoachState; thinking: boolean };
export const COACH_PORT = 7411;
