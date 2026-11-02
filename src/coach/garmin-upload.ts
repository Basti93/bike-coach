import type { CoachState } from './state';

export const RETRY_UPLOAD_MS = 3600_000;
const DEFAULT_MIN_MINUTES = 10;
const MAX_MIN_MINUTES = 240;
const NO_AUTO_RETRY = new Set(['reauth', 'missing-file']);

export type UploadMode = 'off' | 'ask' | 'auto';
export type RideUpload = { status: 'uploading' | 'uploaded' | 'failed'; atMs: number; reason?: string };
export type GarminUploadSettings = { mode: UploadMode; minMinutes: number; enabledAtMs: number | null; rides: Record<string, RideUpload> };

/** Off until the rider switches it on: nothing leaves the Mac by itself. */
export const uploadSettings = (s: Pick<CoachState, 'garminUpload'>): GarminUploadSettings =>
  s.garminUpload ?? { mode: 'off', minMinutes: DEFAULT_MIN_MINUTES, enabledAtMs: null, rides: {} };

export const withUploadSettings = (s: Pick<CoachState, 'garminUpload'>, mode: UploadMode, minMinutes: number, nowMs: number): GarminUploadSettings => {
  const current = uploadSettings(s);
  const minutes = Number.isFinite(minMinutes) ? Math.max(0, Math.min(MAX_MIN_MINUTES, Math.round(minMinutes))) : DEFAULT_MIN_MINUTES;
  // Only rides from now on go up by themselves, never the whole history.
  const enabledAtMs = mode === 'auto' ? (current.mode === 'auto' ? current.enabledAtMs : nowMs) : null;
  return { ...current, mode, minMinutes: minutes, enabledAtMs };
};

export const dueAutoUploads = (s: CoachState, nowMs: number): string[] => {
  const u = uploadSettings(s);
  if (u.mode !== 'auto' || u.enabledAtMs === null) return [];
  return s.summaries
    .filter((r) => r.startedAtMs >= u.enabledAtMs! && r.durationS >= u.minMinutes * 60)
    .filter((r) => {
      const known = u.rides[r.rideId];
      if (!known) return true;
      if (known.status !== 'failed' || NO_AUTO_RETRY.has(known.reason ?? '')) return false;
      return nowMs - known.atMs >= RETRY_UPLOAD_MS;
    })
    .map((r) => r.rideId);
};

/** The button: any mode, but only for known rides that are not up or on their way. */
export const canUpload = (s: CoachState, rideId: string): boolean => {
  if (!s.summaries.some((r) => r.rideId === rideId)) return false;
  const status = uploadSettings(s).rides[rideId]?.status;
  return status !== 'uploaded' && status !== 'uploading';
};
