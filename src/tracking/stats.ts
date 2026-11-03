import { EXERCISES } from '../shared/exercises';
import { dedupeSessions, onePerSession } from '../shared/history';
import { MUSCLE_TARGETS, PAIRS, muscleGroupOf, pairVerdicts, weeklySetRange, type MuscleGroup } from '../shared/muscle-targets';
import type { LoggedWorkout } from '../shared/records';
import { SPORTS, type Sport, type StatsBody } from '../shared/stats';
import { ownExerciseFor } from './similar';

export type WeekStats = { weekStart: string; minutes: Record<Sport, number>; hardDays: number; sets: Partial<Record<MuscleGroup, number>> };
export type StatsView = {
  asOfMs: number | null;
  /** Oldest first, the current week last, 9 entries. */
  weeks: WeekStats[];
  thisWeek: WeekStats;
  targets: Record<MuscleGroup, { min: number; max: number }>;
  pairs: ReturnType<typeof pairVerdicts>;
  verdicts: string[];
  /** Titles counted under Sonstiges, unique. */
  unknown: string[];
  /** Sports with any minutes in the 9 weeks. */
  sports: Sport[];
};

const WEEKS = 9;
const GROUPS = Object.keys(MUSCLE_TARGETS) as MuscleGroup[];
const SPORT_NAME: Record<Sport, string | null> = { bike: 'Rad', strength: 'Krafttraining', run: 'Laufen', mobility: 'Mobility', other: null };

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const total = (w: WeekStats) => sum(SPORTS.map((s) => w.minutes[s]));

/** Monday of the local week of a time, as a local date at midnight. */
function mondayOf(ms: number): Date {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
}

function groupOf(ex: { exerciseId: string; title: string }, stats: StatsBody | null): MuscleGroup | null {
  const own = ownExerciseFor({ title: ex.title, exerciseId: ex.exerciseId }, EXERCISES);
  if (own) return muscleGroupOf({ id: own.id, title: own.title, primaryMuscle: own.primaryMuscle });
  const m = stats?.muscles[ex.exerciseId];
  if (m) return m in MUSCLE_TARGETS ? (m as MuscleGroup) : muscleGroupOf({ id: ex.exerciseId, title: ex.title, primaryMuscle: m });
  return null;
}

/** The numbers of the statistics page: minutes and hard days from the stats record, sets from the workouts. */
export function statsView(stats: StatsBody | null, workouts: LoggedWorkout[], nowMs: number): StatsView {
  const monday = mondayOf(nowMs);
  const starts = Array.from({ length: WEEKS }, (_, i) => isoDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (WEEKS - 1 - i))));
  const weeks: WeekStats[] = starts.map((weekStart) => ({ weekStart, minutes: { bike: 0, strength: 0, run: 0, mobility: 0, other: 0 }, hardDays: 0, sets: {} }));
  const weekOf = (iso: string) => { for (let i = WEEKS - 1; i >= 0; i--) if (iso >= starts[i]) return weeks[i]; return null; };

  for (const d of stats?.days ?? []) {
    const w = weekOf(d.date);
    if (!w) continue;
    for (const s of SPORTS) w.minutes[s] += d.minutes[s];
    if (d.hardness === 'hard') w.hardDays++;
  }

  const unknown = new Set<string>();
  for (const wo of onePerSession(dedupeSessions(workouts))) {
    const w = weekOf(isoDate(new Date(wo.startMs)));
    if (!w) continue;
    for (const ex of wo.exercises) {
      const n = ex.sets.filter((s) => s.doneMs !== null && s.type !== 'warmup').length;
      if (n === 0) continue;
      let g = groupOf(ex, stats);
      if (!g) { g = 'other'; unknown.add(ex.title); }
      else if (g === 'other') unknown.add(ex.title);
      w.sets[g] = (w.sets[g] ?? 0) + n;
    }
  }

  const complete = weeks.slice(0, WEEKS - 1);
  const last4 = complete.slice(-4);
  const sets4: Partial<Record<MuscleGroup, number>> = {};
  for (const g of GROUPS) sets4[g] = sum(last4.map((w) => w.sets[g] ?? 0));
  const pairs = pairVerdicts(sets4);

  const verdicts: string[] = [];
  for (const [i, p] of pairs.entries()) {
    if (!p.short) continue;
    const shortG = p.short, otherG = PAIRS[i].a === shortG ? PAIRS[i].b : PAIRS[i].a;
    const sn = sets4[shortG] ?? 0, on = sets4[otherG] ?? 0;
    verdicts.push(`${MUSCLE_TARGETS[shortG].label} ${sn} Sätze, ${MUSCLE_TARGETS[otherG].label} ${on}: ${MUSCLE_TARGETS[shortG].label} kommt zu kurz.`);
  }
  for (const w of [complete[complete.length - 1], weeks[WEEKS - 1]]) {
    if (w.hardDays > 2) verdicts.push(`${w.hardDays} harte Tage in der Woche vom ${short(w.weekStart)} Mehr als zwei sind viel.`);
  }
  for (const s of SPORTS) {
    const name = SPORT_NAME[s];
    if (!name) continue;
    const setUp = weeks.slice(0, WEEKS - 4).some((w) => w.minutes[s] > 0);
    if (setUp && complete.slice(-3).every((w) => w.minutes[s] === 0)) verdicts.push(`Seit drei Wochen kein ${name}.`);
  }
  for (let i = complete.length - 1; i >= 4; i--) {
    const mean = sum(complete.slice(i - 4, i).map(total)) / 4;
    if (mean > 0 && total(complete[i]) >= 1.5 * mean) {
      verdicts.push(`Die Woche vom ${short(complete[i].weekStart)} hatte deutlich mehr Minuten als die vier davor.`);
      break;
    }
  }

  const targets = {} as Record<MuscleGroup, { min: number; max: number }>;
  for (const g of GROUPS) targets[g] = weeklySetRange(g, stats?.goal);

  return {
    asOfMs: stats?.atMs ?? null, weeks, thisWeek: weeks[WEEKS - 1], targets, pairs, verdicts, unknown: [...unknown],
    sports: SPORTS.filter((s) => weeks.some((w) => w.minutes[s] > 0)),
  };
}
