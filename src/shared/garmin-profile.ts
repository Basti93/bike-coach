import { estimateFtp, type Sex } from './ftp-estimate';
import type { GarminActivity, GarminBody } from './garmin';
import type { Profile } from './profiles';

const DAY_MS = 86_400_000;
const RUN_WINDOW_DAYS = 180;
const ACTIVITY_WINDOW_DAYS = 28;
const MIN_RUN_M = 5000;
const MIN_5K_MIN = 12;
const MIN_HR = 100;
const MAX_HR = 240;
// PA-R-Skala der Schätzung, Stunden pro Woche als eigene Setzung.
const HOURS_TO_LEVEL: [number, number][] = [[0.5, 1], [1, 2], [3, 3], [5, 4], [8, 5], [12, 6]];
const HIGHEST_LEVEL = 7;

export type GarminSuggestion = {
  birthDate: string | null; sex: Sex; heightCm: number | null; weightKg: number | null; activity: number | null; run5kMin: number | null;
  ftp: { startW: number; source: 'garmin' | 'estimate'; capW?: number } | null; maxHrBpm: number | null; missing: string[];
};

const ageAt = (birthDate: string, nowMs: number): number => {
  const birth = new Date(birthDate);
  const now = new Date(nowMs);
  const before = now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  return now.getUTCFullYear() - birth.getUTCFullYear() - (before ? 1 : 0);
};

const best5k = (activities: GarminActivity[], nowMs: number): number | null => {
  const paces = activities
    .filter((a) => /running/i.test(a.sport) && (a.distanceM ?? 0) >= MIN_RUN_M && nowMs - a.startMs < RUN_WINDOW_DAYS * DAY_MS && a.durationS > 0)
    .map((a) => ((a.durationS / a.distanceM!) * MIN_RUN_M) / 60)
    .filter((m) => m >= MIN_5K_MIN);
  return paces.length ? Math.min(...paces) : null;
};

const activityLevel = (activities: GarminActivity[], nowMs: number): number => {
  const hours = activities.filter((a) => nowMs - a.startMs < ACTIVITY_WINDOW_DAYS * DAY_MS).reduce((sum, a) => sum + a.durationS / 3600, 0);
  const perWeek = hours / (ACTIVITY_WINDOW_DAYS / 7);
  return HOURS_TO_LEVEL.find(([limit]) => perWeek < limit)?.[1] ?? HIGHEST_LEVEL;
};

export const suggestProfile = (body: GarminBody, activities: GarminActivity[], nowMs: number): GarminSuggestion => {
  const activity = activityLevel(activities, nowMs);
  const run5kMin = best5k(activities, nowMs);
  let ftp: GarminSuggestion['ftp'] = null;
  if (body.ftpW !== null && !body.ftpStale) ftp = { startW: body.ftpW, source: 'garmin' };
  else if (body.birthDate && body.heightCm && body.weightKg) {
    const e = estimateFtp({ age: ageAt(body.birthDate, nowMs), sex: body.sex, heightCm: body.heightCm, weightKg: body.weightKg, activity, ...(run5kMin ? { run5kMin } : {}) });
    ftp = { startW: e.startW, source: 'estimate', capW: e.capW };
  }
  const maxHrBpm = body.maxHrSeen !== null && body.maxHrSeen >= MIN_HR && body.maxHrSeen <= MAX_HR ? body.maxHrSeen : null;
  const missing = [
    !body.birthDate && 'Geburtsdatum', body.sex === 'unknown' && 'Geschlecht', !body.heightCm && 'Größe', !body.weightKg && 'Gewicht', !ftp && 'FTP', !maxHrBpm && 'Pulsgrenze',
  ].filter((x): x is string => typeof x === 'string');
  return { birthDate: body.birthDate, sex: body.sex, heightCm: body.heightCm, weightKg: body.weightKg, activity, run5kMin, ftp, maxHrBpm, missing };
};

export type ReviewKey = 'birthDate' | 'sex' | 'heightCm' | 'weightKg' | 'ftpW' | 'maxHrBpm';
export type ReviewField = { key: ReviewKey; label: string; garmin: string; own: string | null; selected: boolean };

/** Nur was fehlt oder abweicht. Leeres wird vorgeschlagen, Eigenes nie, und Training und Sicherheit entscheidest immer du. */
export const reviewFields = (profile: Profile, ftpW: number, s: GarminSuggestion): ReviewField[] => {
  const SENSITIVE: ReviewKey[] = ['ftpW', 'maxHrBpm'];
  const rows: [ReviewKey, string, string | number | null, string | number | undefined][] = [
    ['birthDate', 'Geburtsdatum', s.birthDate, profile.birthDate],
    ['sex', 'Geschlecht', s.sex === 'unknown' ? null : s.sex, profile.sex],
    ['heightCm', 'Größe', s.heightCm, profile.heightCm],
    ['weightKg', 'Gewicht', s.weightKg, profile.weightKg],
    ['ftpW', 'FTP', s.ftp?.startW ?? null, ftpW],
    ['maxHrBpm', 'Pulsgrenze', s.maxHrBpm, profile.maxHrBpm],
  ];
  return rows.flatMap(([key, label, garmin, own]) => {
    if (garmin === null || String(garmin) === String(own ?? '')) return [];
    const empty = own === undefined || own === '';
    return [{ key, label, garmin: String(garmin), own: empty ? null : String(own), selected: empty && !SENSITIVE.includes(key) }];
  });
};
