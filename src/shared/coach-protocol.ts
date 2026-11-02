import type { CoachState, Rating } from '../coach/state';
import type { Together } from '../coach/together';
import type { GarminHealth, GarminReadiness } from './garmin';
import type { GarminSuggestion } from './garmin-profile';
import type { GymPublic } from '../coach/gym/public';
import type { GymWorkout } from '../coach/gym/types';

export type GarminStatus =
  | { state: 'idle' | 'connecting' | 'needs-mfa' | 'connected' }
  | { state: 'failed'; reason: 'credentials' | 'rate-limit' | 'setup' | 'failed' };

export type GarminSyncInfo = { running: boolean; lastRunMs: number | null; complete: boolean; problem: 'reauth' | 'rate-limit' | 'failed' | null };

export type HevyStatus =
  | { state: 'idle' | 'connecting' }
  | { state: 'connected'; workouts: number; loading: boolean; lastSyncMs: number | null }
  | { state: 'failed'; reason: 'invalid' | 'expired' | 'failed' };

export type CoachClientMessage =
  | { type: 'hevy-connect'; profileId: string; key: string }
  | { type: 'hevy-disconnect'; profileId: string }
  | { type: 'garmin-login'; profileId: string; email: string; password: string }
  | { type: 'garmin-mfa'; profileId: string; code: string }
  | { type: 'garmin-disconnect'; profileId: string }
  | { type: 'garmin-health'; profileId: string; rangeDays: number | null }
  | { type: 'set-ftp'; profileId: string; ftpW: number }
  | { type: 'subscribe'; profileId: string }
  | { type: 'feedback'; profileId: string; rideId: string; rating: Rating }
  | { type: 'skip-feedback'; profileId: string } | { type: 'skip-ramp'; profileId: string }
  | { type: 'note'; profileId: string; text: string }
  | { type: 'complaint-update'; profileId: string; id: string; status: 'active' | 'healing' | 'over' }
  | { type: 'answer-question'; profileId: string; questionId: string; text: string }
  | { type: 'skip-question'; profileId: string }
  | { type: 'debrief-seen'; profileId: string }
  | { type: 'garmin-upload-settings'; profileId: string; mode: 'off' | 'ask' }
  | { type: 'garmin-upload'; profileId: string; rideId: string; repoLink?: boolean }
  | { type: 'debrief-answer'; profileId: string; rideId: string; question: string; text: string }
  | { type: 'debrief-skip-question'; profileId: string; rideId: string; question: string }
  | { type: 'remove-motive'; profileId: string; atMs: number }
  | { type: 'ride-detail'; profileId: string; rideId: string }
  | { type: 'remove-rule'; profileId: string; atMs: number }
  | { type: 'word-result'; profileId: string; nl: string; knew: boolean }
  | { type: 'adjust'; profileId: string; how: 'easier' | 'harder' | 'shorter' }
  | { type: 'pass-select'; profileId: string; passId: string }
  | { type: 'pass-progress'; profileId: string; passId: string; distanceM: number }
  | { type: 'pass-summit'; profileId: string; passId: string }
  | { type: 'gym-adjust'; profileId: string; how: 'easier' | 'harder' | 'shorter' }
  | { type: 'gym-note'; profileId: string; text: string }
  | { type: 'gym-answer'; profileId: string; question: string; text: string }
  | { type: 'gym-skip-question'; profileId: string; question: string }
  | { type: 'gym-remove-rule'; profileId: string; atMs: number }
  | { type: 'gym-forget'; profileId: string }
  | { type: 'gym-preview'; profileId: string }
  | { type: 'gym-confirm'; profileId: string; name: string };
export type RideDetail = { rideId: string; points: { t: number; powerW: number | null; hrBpm: number | null; cadenceRpm: number | null }[] };
export type GymConfirmResult = 'written' | 'stale' | 'failed';
export type CoachServerMessage = { type: 'gym-preview'; preview: { workout: GymWorkout; edited: boolean } | null } | { type: 'gym-confirm-result'; result: GymConfirmResult } | { type: 'garmin-health'; data: GarminHealth } | { type: 'ride-detail'; detail: RideDetail } | { type: 'coach-state'; state: CoachState; thinking: boolean; debriefing?: boolean; together: Together; hevy?: HevyStatus; garmin?: GarminStatus; garminSync?: GarminSyncInfo; garminReadiness?: GarminReadiness | null; garminSuggestion?: GarminSuggestion | null; gym?: GymPublic | null };
export const COACH_PORT = 7411;
