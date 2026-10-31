import fs from 'node:fs';
import path from 'node:path';
import type { Session } from '../shared/session';
import type { ClaudeErrorKind } from './claude-client';
import type { RideSummary } from './metrics';
import { rampTest } from './rules';

export type Rating = 'easy' | 'right' | 'hard';
export type CoachState = {
  profileId: string; ftpW: number;
  ftpHistory: { atMs: number; ftpW: number; source: 'manual' | 'ramp' | 'coach' }[];
  phase: { name: string; weeksLeft: number; goal: string };
  ftpForecast: { weeksAhead: number; ftpW: number }[];
  next: { session: Session; reason: string; source: 'claude' | 'rules' };
  changes: { atMs: number; text: string }[];
  notes: { atMs: number; text: string; reply?: string }[];
  feedback: Record<string, Rating>;
  summaries: RideSummary[];
  processedRides: string[];
  awaitingFeedback: string | null;
  dirty: boolean;
  dirtySinceMs: number | null;
  lastError: ClaudeErrorKind | null;
  lastAttemptMs: number | null;
};

const file = (dir: string, profileId: string) => path.join(dir, `${encodeURIComponent(profileId)}.json`);

const initial = (profileId: string, ftpW: number, nowMs: number): CoachState => ({
  profileId, ftpW, ftpHistory: [{ atMs: nowMs, ftpW, source: 'manual' }],
  phase: { name: 'Einstieg', weeksLeft: 0, goal: 'Die eigene Leistung kennenlernen' }, ftpForecast: [],
  next: { session: rampTest(ftpW), reason: 'Der Rampentest zeigt, wo du gerade stehst. Danach richtet sich alles nach deinen Werten.', source: 'rules' },
  changes: [], notes: [], feedback: {}, summaries: [], processedRides: [], awaitingFeedback: null,
  dirty: false, dirtySinceMs: null, lastError: null, lastAttemptMs: null,
});

export const loadState = (dir: string, profileId: string, initialFtpW: number, nowMs: number): CoachState => {
  const f = file(dir, profileId);
  if (!fs.existsSync(f)) return initial(profileId, initialFtpW, nowMs);
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as CoachState;
  } catch {
    fs.copyFileSync(f, `${f}.broken`);
    return initial(profileId, initialFtpW, nowMs);
  }
};

export const saveState = (dir: string, state: CoachState): void => {
  fs.mkdirSync(dir, { recursive: true });
  const f = file(dir, state.profileId);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(state));
  fs.renameSync(`${f}.tmp`, f);
};
