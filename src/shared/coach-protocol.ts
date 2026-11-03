import type { CoachState, Rating } from '../coach/state';
import type { Together } from '../coach/together';
import type { GarminHealth, GarminReadiness } from './garmin';
import type { GarminSuggestion } from './garmin-profile';
import type { GymPublic } from '../coach/gym/public';
import type { GymWorkout } from '../coach/gym/types';
import type { StrengthHealth } from '../coach/strength';
import type { MobilityView } from '../coach/mobility/mobility';
import type { RecordKind, TrackedRecord } from './records';
import type { MealsView } from '../coach/meals/meal-coach';
import type { ItemState } from './meals';

export type GarminStatus =
  | { state: 'idle' | 'connecting' | 'needs-mfa' | 'connected' }
  | { state: 'failed'; reason: 'credentials' | 'rate-limit' | 'setup' | 'failed' };

export type GarminSyncInfo = { running: boolean; lastRunMs: number | null; complete: boolean; problem: 'reauth' | 'rate-limit' | 'failed' | null };

export type HevyStatus =
  | { state: 'idle' | 'connecting' }
  | { state: 'connected'; workouts: number; loading: boolean; lastSyncMs: number | null }
  | { state: 'failed'; reason: 'invalid' | 'expired' | 'failed' };

/** The link to a Pandafit account. Never carries the token or the password. */
export type AccountStatus = { state: 'idle' | 'linking' | 'linked' | 'rejected' | 'failed'; name: string | null; reason: 'invalid' | 'limited' | 'url' | 'failed' | null; refused: number; offline: boolean; lastSyncMs: number | null };

export type CoachClientMessage =
  | { type: 'account-link'; profileId: string; url: string; name: string; password: string }
  | { type: 'account-unlink'; profileId: string }
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
  | { type: 'gym-start'; profileId: string }
  | { type: 'gym-forget'; profileId: string }
  | { type: 'gym-preview'; profileId: string }
  | { type: 'gym-confirm'; profileId: string; name: string }
  | { type: 'mobility-done'; profileId: string; sessionId: string }
  | { type: 'mobility-feel'; profileId: string; text: string }
  | { type: 'meals-settings'; profileId: string; settings: unknown }
  | { type: 'meals-replan'; profileId: string; week: string }
  | { type: 'meals-swap'; profileId: string; week: string; meal: string; ai: boolean }
  | { type: 'meals-eater'; profileId: string; week: string; meal: string; person: string; on: boolean }
  | { type: 'meals-item'; profileId: string; week: string; item: string; state: ItemState }
  | { type: 'records-put'; requestId: string; profileId: string; record: TrackedRecord; seenMs?: number }
  | { type: 'records-list'; requestId: string; profileId: string; kind: RecordKind };
export type RideDetail = { rideId: string; points: { t: number; powerW: number | null; hrBpm: number | null; cadenceRpm: number | null }[] };
export type GymConfirmResult = 'written' | 'stale' | 'failed';
export type CoachServerMessage = { type: 'records'; requestId: string; kind: RecordKind; records: TrackedRecord[] } | { type: 'records-put-result'; requestId: string; ok: boolean; refused?: boolean; kept?: boolean; updatedMs?: number } | { type: 'records-changed'; profileId: string } | { type: 'gym-preview'; preview: { workout: GymWorkout; edited: boolean; leftOut?: string[] } | null } | { type: 'gym-confirm-result'; result: GymConfirmResult } | { type: 'garmin-health'; data: GarminHealth } | { type: 'ride-detail'; detail: RideDetail } | { type: 'coach-state'; state: CoachState; thinking: boolean; debriefing?: boolean; together: Together; hevy?: HevyStatus; garmin?: GarminStatus; garminSync?: GarminSyncInfo; garminReadiness?: GarminReadiness | null; garminSuggestion?: GarminSuggestion | null; gym?: GymPublic | null; strengthHealth?: StrengthHealth | null; mobility?: MobilityView | null; account?: AccountStatus; meals?: MealsView | null };
export const COACH_PORT = 7411;
