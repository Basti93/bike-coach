/**
 * Weekly working sets and rep ranges per muscle group.
 *
 * Sets: population averages after the volume landmarks of Renaissance Periodization (Israetel): the "adaptive" range
 * for a muscle-building goal, the minimum effective range otherwise. Direct sets only; arms get fewer because rows and
 * presses already train them. More sets tend to bring more growth with diminishing returns (Schoenfeld 2017;
 * Pelland et al. 2024, preprint).
 *
 * Reps: growth is about the same from roughly 5 to 30 reps when sets end close to failure (Schoenfeld 2017, Lopez 2021).
 * The ranges below are practice, not proof: big compound lifts sit lower (heavy and safe to load), small muscles and
 * isolation work higher (less joint stress, easier to reach failure cleanly), as RP recommends for calves, side delts
 * and forearms. A rep range is a starting point, never a rule.
 */
export type MuscleGroup =
  | 'chest' | 'back' | 'front_delts' | 'side_rear_delts' | 'biceps' | 'triceps'
  | 'quads' | 'hams_glutes' | 'calves' | 'abs' | 'traps' | 'forearms' | 'other';

export type MuscleTarget = { label: string; muscle: { min: number; max: number }; other: { min: number; max: number }; reps: { min: number; max: number } };

export const MUSCLE_TARGETS: Record<MuscleGroup, MuscleTarget> = {
  chest: { label: 'Brust', muscle: { min: 12, max: 18 }, other: { min: 6, max: 8 }, reps: { min: 6, max: 12 } },
  back: { label: 'Rücken', muscle: { min: 14, max: 20 }, other: { min: 8, max: 10 }, reps: { min: 6, max: 12 } },
  front_delts: { label: 'Schultern vorn', muscle: { min: 6, max: 10 }, other: { min: 2, max: 4 }, reps: { min: 6, max: 12 } },
  side_rear_delts: { label: 'Schultern seitlich und hinten', muscle: { min: 12, max: 20 }, other: { min: 6, max: 8 }, reps: { min: 12, max: 25 } },
  biceps: { label: 'Bizeps', muscle: { min: 10, max: 14 }, other: { min: 4, max: 6 }, reps: { min: 8, max: 15 } },
  triceps: { label: 'Trizeps', muscle: { min: 10, max: 12 }, other: { min: 4, max: 6 }, reps: { min: 8, max: 15 } },
  quads: { label: 'Oberschenkel vorn', muscle: { min: 12, max: 18 }, other: { min: 6, max: 8 }, reps: { min: 6, max: 12 } },
  hams_glutes: { label: 'Oberschenkel hinten und Gesäß', muscle: { min: 10, max: 16 }, other: { min: 4, max: 6 }, reps: { min: 6, max: 12 } },
  calves: { label: 'Waden', muscle: { min: 12, max: 16 }, other: { min: 6, max: 8 }, reps: { min: 10, max: 20 } },
  abs: { label: 'Bauch', muscle: { min: 10, max: 16 }, other: { min: 4, max: 8 }, reps: { min: 10, max: 20 } },
  traps: { label: 'Nacken und Trapez', muscle: { min: 6, max: 12 }, other: { min: 0, max: 4 }, reps: { min: 10, max: 20 } },
  forearms: { label: 'Unterarme', muscle: { min: 4, max: 10 }, other: { min: 0, max: 4 }, reps: { min: 12, max: 25 } },
  other: { label: 'Sonstiges', muscle: { min: 0, max: 0 }, other: { min: 0, max: 0 }, reps: { min: 8, max: 15 } },
};

const BY_MUSCLE: Record<string, MuscleGroup> = {
  chest: 'chest', lats: 'back', upper_back: 'back', lower_back: 'back', biceps: 'biceps', triceps: 'triceps',
  quadriceps: 'quads', hamstrings: 'hams_glutes', glutes: 'hams_glutes', calves: 'calves', abdominals: 'abs',
  traps: 'traps', forearms: 'forearms',
};
const REAR_OR_SIDE = /lateral raise|seitheben|rear delt|reverse fly|face pull|upright row|y raise|reverse flys/i;
const REAR_OR_SIDE_IDS = new Set(['pf-lateral-raise', 'pf-lateral-raise-cable', 'pf-rear-delt-fly', 'pf-face-pull']);

/** The group an exercise counts for: its primary muscle, with shoulders split by the kind of exercise. */
export function muscleGroupOf(e: { id?: string; title: string; primaryMuscle: string | null | undefined }): MuscleGroup {
  if (e.primaryMuscle === 'shoulders') return (e.id && REAR_OR_SIDE_IDS.has(e.id)) || REAR_OR_SIDE.test(e.title) ? 'side_rear_delts' : 'front_delts';
  return (e.primaryMuscle && BY_MUSCLE[e.primaryMuscle]) || 'other';
}

/** The weekly set range for a group: the building range for a muscle goal, the minimum effective range otherwise. */
export const weeklySetRange = (g: MuscleGroup, goal: string | null | undefined): { min: number; max: number } =>
  goal === 'muscle' ? MUSCLE_TARGETS[g].muscle : MUSCLE_TARGETS[g].other;

export const PAIRS: { a: MuscleGroup; b: MuscleGroup; label: string }[] = [
  { a: 'chest', b: 'back', label: 'Brust : Rücken' },
  { a: 'quads', b: 'hams_glutes', label: 'Oberschenkel vorn : Oberschenkel hinten und Gesäß' },
  { a: 'front_delts', b: 'side_rear_delts', label: 'Schultern vorn : Schultern seitlich und hinten' },
];

/** Set counts of both sides of each pair. `short` is the smaller side when it is below two thirds of the larger and the larger has at least 6. */
export function pairVerdicts(sets4Weeks: Partial<Record<MuscleGroup, number>>): { label: string; a: number; b: number; short: MuscleGroup | null }[] {
  return PAIRS.map((p) => {
    const a = sets4Weeks[p.a] ?? 0, b = sets4Weeks[p.b] ?? 0;
    const large = Math.max(a, b), small = Math.min(a, b);
    const short = large >= 6 && small < (2 / 3) * large ? (a < b ? p.a : p.b) : null;
    return { label: p.label, a, b, short };
  });
}
