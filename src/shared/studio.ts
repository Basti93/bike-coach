import type { LoggedWorkout } from './records';

/** The studio is where a workout was done; weights depend on its equipment. Pure, shared by app and coach. */
type WithStudio = Pick<LoggedWorkout, 'startMs'> & { studio?: string; id?: string };

export const STUDIO_MAX = 40;

/** A typed name: trimmed, at most 40 characters; nothing left means no studio. */
export function studioName(raw: string): string | undefined {
  const n = raw.trim().slice(0, STUDIO_MAX).trim();
  return n === '' ? undefined : n;
}

/** The studio of the earliest workout that has one. Undefined while no workout has a studio. */
export function mainStudio(workouts: readonly WithStudio[]): string | undefined {
  let main: (WithStudio & { id?: string }) | undefined;
  // A tie on the start is broken by id, so every device agrees.
  for (const w of workouts as readonly (WithStudio & { id?: string })[]) {
    if (w.studio && (!main || w.startMs < main.startMs || (w.startMs === main.startMs && (w.id ?? '') < (main.id ?? '')))) main = w;
  }
  return main?.studio;
}

/** The bucket a workout counts for: its own studio, else the main one (old workouts, Hevy imports), else one shared bucket (''). */
export const studioKey = (w: { studio?: string }, main: string | undefined): string => w.studio ?? main ?? '';

/** Names this profile has used, newest first. */
export function knownStudios(workouts: readonly WithStudio[]): string[] {
  const seen = new Set<string>();
  for (const w of [...workouts].sort((a, b) => b.startMs - a.startMs)) if (w.studio) seen.add(w.studio);
  return [...seen];
}

/** The studio of the newest own (not Hevy) workout; undefined when none is known. */
export function defaultStudio(workouts: readonly (WithStudio & { source: LoggedWorkout['source'] })[]): string | undefined {
  const own = workouts.filter((w) => w.source === 'pandafit');
  const newest = own.reduce<(typeof own)[number] | null>((a, w) => (!a || w.startMs > a.startMs ? w : a), null);
  return newest ? studioKey(newest, mainStudio(workouts)) || undefined : undefined;
}
