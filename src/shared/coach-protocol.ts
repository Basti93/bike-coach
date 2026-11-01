import type { CoachState, Rating } from '../coach/state';
import type { Together } from '../coach/together';
import type { GarminReadiness } from './garmin';
import type { GarminSuggestion } from './garmin-profile';

export type GarminStatus =
  | { state: 'idle' | 'connecting' | 'needs-mfa' | 'connected' }
  | { state: 'failed'; reason: 'credentials' | 'rate-limit' | 'setup' | 'failed' };

export type GarminSyncInfo = { running: boolean; lastRunMs: number | null; complete: boolean; problem: 'reauth' | 'rate-limit' | 'failed' | null };

export type CoachClientMessage =
  | { type: 'garmin-login'; profileId: string; email: string; password: string }
  | { type: 'garmin-mfa'; profileId: string; code: string }
  | { type: 'garmin-disconnect'; profileId: string }
  | { type: 'set-ftp'; profileId: string; ftpW: number }
  | { type: 'subscribe'; profileId: string }
  | { type: 'feedback'; profileId: string; rideId: string; rating: Rating }
  | { type: 'skip-feedback'; profileId: string } | { type: 'skip-ramp'; profileId: string }
  | { type: 'note'; profileId: string; text: string }
  | { type: 'ride-detail'; profileId: string; rideId: string }
  | { type: 'remove-rule'; profileId: string; atMs: number }
  | { type: 'word-result'; profileId: string; nl: string; knew: boolean }
  | { type: 'adjust'; profileId: string; how: 'easier' | 'harder' | 'shorter' };
export type RideDetail = { rideId: string; points: { t: number; powerW: number | null; hrBpm: number | null }[] };
export type CoachServerMessage = { type: 'ride-detail'; detail: RideDetail } | { type: 'coach-state'; state: CoachState; thinking: boolean; together: Together; garmin?: GarminStatus; garminSync?: GarminSyncInfo; garminReadiness?: GarminReadiness | null; garminSuggestion?: GarminSuggestion | null };
export const COACH_PORT = 7411;
