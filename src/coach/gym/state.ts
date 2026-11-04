import fs from 'node:fs';
import path from 'node:path';
import type { ClaudeErrorKind } from '../claude-client';
import type { GymWorkout } from './types';
import type { GymOutlook } from '../../shared/gym-outlook';

export type GymState = {
  profileId: string;
  goal: 'muscle';
  next: { workout: GymWorkout; reason: string; source: 'claude' | 'rules' } | null;
  /** The workouts after the next one, sketched, and where the training is heading. Null until the AI planned. */
  outlook: GymOutlook | null;
  /** Why there is no workout right now: the rule workout found nothing to offer. Never stored as a workout. */
  emptyReason: string | null;
  lastNote: { workoutId: string; text: string; questions: string[]; atMs: number } | null;
  rules: { atMs: number; text: string }[];
  /** The rider's own notes, handed to the AI as data. */
  notes: { atMs: number; text: string }[];
  answers: { atMs: number; question: string; text: string }[];
  seenWorkoutIds: string[];
  routine: { routineId: string; updatedAt: string } | null;
  /** True once a plan completed (by AI or by the rules after a refused answer). */
  planned: boolean;
  /** The open complaints the plan took into account. The only thing from the bike coach that can trigger a replan. */
  complaintsFingerprint: string;
  /** The gym question after a long break is asked once per break. */
  gymAsked: boolean;
  dirty: boolean;
  attempts: number;
  attemptKey: string | null;
  lastError: ClaudeErrorKind | null;
  lastAttemptMs: number | null;
  /** When fetching the templates last failed. Such a failure is no attempt: it only waits and tries again. */
  templatesFailedMs: number | null;
  /** "Krafttraining starten": the rider began without Hevy. Kept on the Mac only. */
  localStart: boolean;
  /** Hevy template id to own exercise id, as last seen. Kept so history stays linked after Hevy is removed. */
  links: Record<string, string>;
};

const file = (dir: string, profileId: string) => path.join(dir, `${encodeURIComponent(profileId)}.json`);

export const initialGymState = (profileId: string): GymState => ({
  profileId, goal: 'muscle', next: null, outlook: null, emptyReason: null, lastNote: null, rules: [], notes: [], answers: [], seenWorkoutIds: [],
  routine: null, planned: false, complaintsFingerprint: '', gymAsked: false, dirty: false, attempts: 0, attemptKey: null, lastError: null, lastAttemptMs: null, templatesFailedMs: null, localStart: false, links: {},
});

export const loadGymState = (dir: string, profileId: string): GymState => {
  const f = file(dir, profileId);
  if (!fs.existsSync(f)) return initialGymState(profileId);
  try {
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8')) as GymState;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not a state');
    return { ...initialGymState(profileId), ...parsed, profileId };
  } catch {
    try { fs.copyFileSync(f, `${f}.broken`); } catch { /* starting fresh matters more */ }
    return initialGymState(profileId);
  }
};

export const saveGymState = (dir: string, state: GymState): void => {
  fs.mkdirSync(dir, { recursive: true });
  const f = file(dir, state.profileId);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(state));
  fs.renameSync(`${f}.tmp`, f);
};

export const removeGymState = (dir: string, profileId: string): void => {
  fs.rmSync(file(dir, profileId), { force: true });
};
