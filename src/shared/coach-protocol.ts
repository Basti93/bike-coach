import type { CoachState, Rating } from '../coach/state';
import type { Together } from '../coach/together';

export type CoachClientMessage =
  | { type: 'subscribe'; profileId: string }
  | { type: 'feedback'; profileId: string; rideId: string; rating: Rating }
  | { type: 'skip-feedback'; profileId: string } | { type: 'skip-ramp'; profileId: string }
  | { type: 'note'; profileId: string; text: string }
  | { type: 'remove-rule'; profileId: string; atMs: number }
  | { type: 'word-result'; profileId: string; nl: string; knew: boolean }
  | { type: 'adjust'; profileId: string; how: 'easier' | 'harder' | 'shorter' };
export type CoachServerMessage = { type: 'coach-state'; state: CoachState; thinking: boolean; together: Together };
export const COACH_PORT = 7411;
