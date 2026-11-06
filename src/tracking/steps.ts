import type { LoggedWorkout, TrackedRecord } from '../shared/records';
import { learnLadder, loadStepId, loadStepRecord, platesPerSide, withOverride, type LoadStepOverrides } from '../shared/loads';
import { defaultStudio, mainStudio, studioKey } from '../shared/studio';
import { ruleNumber } from '../shared/training-policy';
import { formatDecimal } from './session';

/** The studio bucket the open workout counts for: its own, else the default studio, else the main one, else the shared bucket (''). */
export function hereKey(w: { studio?: string }, history: readonly LoggedWorkout[]): string {
  return w.studio ?? defaultStudio(history) ?? mainStudio(history) ?? '';
}

const SESSIONS = 10;

/** The weight step of an exercise here: learned from its newest 10 sessions in this studio, then the person's own choice. */
export function stepHere(exerciseId: string, equipment: string, history: readonly LoggedWorkout[], key: string, overrides: LoadStepOverrides): { stepKg: number; own: boolean } {
  const main = mainStudio(history);
  const weights = history
    .filter((w) => studioKey(w, main) === key && w.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.startMs - a.startMs).slice(0, SESSIONS)
    .flatMap((w) => w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.type === 'normal' || s.type === 'failure').map((s) => s.weightKg ?? 0)))
    .filter((x) => x > 0);
  const learned = learnLadder(weights, equipment);
  const l = withOverride(learned, overrides, { exerciseId, studio: key });
  return { stepKg: l.stepKg, own: l.stepKg !== learned.stepKg || overrides.has(`${exerciseId}|${key}`) };
}

/** "Gewichtsstufen hier: 5 kg (gelernt)". */
export const stepLine = (s: { stepKg: number; own: boolean }): string => `Gewichtsstufen hier: ${formatDecimal(s.stepKg)} kg (${s.own ? 'von dir' : 'gelernt'})`;

/** The plate line of a barbell set: "Pro Seite: 20 + 2,5", "Nicht genau auflegbar – 60 oder 62,5" or "Leichter als die Stange (20 kg)". */
export function plateLine(totalKg: number): string {
  const p = platesPerSide(totalKg);
  const bar = formatDecimal(ruleNumber('load.bar-kg'));
  if (p.status === 'below-bar') return `Leichter als die Stange (${bar} kg)`;
  if (p.status === 'between') return `Nicht genau auflegbar – ${formatDecimal(p.lower as number)} oder ${formatDecimal(p.upper as number)}`;
  return p.perSide.length === 0 ? `Nur die Stange (${bar} kg)` : `Pro Seite: ${p.perSide.map(formatDecimal).join(' + ')}`;
}

/** The record that sets the step here, or with `stepKg` null the tombstone ("gelernt"). Stamped above what is stored, tombstones included. */
export function stepChange(stored: readonly TrackedRecord[], exerciseId: string, key: string, stepKg: number | null, nowMs: number): TrackedRecord {
  const id = loadStepId(exerciseId, key);
  const above = Math.max(nowMs, (stored.find((r) => r.kind === 'loadstep' && r.id === id)?.updatedMs ?? 0) + 1);
  if (stepKg !== null) return loadStepRecord(exerciseId, key, stepKg, above);
  return { ...loadStepRecord(exerciseId, key, 1, above), deleted: true };
}
