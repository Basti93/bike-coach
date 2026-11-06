import type { MuscleGroup } from '../shared/muscle-targets';
import type { LoggedSet, LoggedWorkout } from '../shared/records';
import { paceText } from '../shared/run';

/** One line of the progress card: what, where it stands, and how it moved. */
export type ProgressRow = { label: string; value: string; change?: string };

const DAY = 86_400_000;
/** The comparison point for FTP: the newest value at least this old. */
const FTP_BACK_DAYS = 56;
const RECENT_DAYS = 28;
const BEFORE_DAYS = 84;
const MAX_LIFTS = 3;
const MAX_REPS = 12;
const comma = (n: number, digits = 1) => (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits).replace('.', ',');
const signed = (n: number) => (Math.abs(n) < 0.05 ? '±0' : `${n > 0 ? '+' : '−'}${comma(Math.abs(n))}`);

/** Estimated one-rep max (Epley) of the best working set with 1 to 12 reps and a weight; null without one. */
export function estimatedMax(sets: LoggedSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.type === 'warmup' || s.weightKg === null || s.weightKg <= 0 || s.reps === null || s.reps < 1 || s.reps > MAX_REPS) continue;
    const e = s.reps === 1 ? s.weightKg : s.weightKg * (1 + s.reps / 30);
    if (best === null || e > best) best = e;
  }
  return best;
}

type Input = {
  nowMs: number;
  ftp: { atMs: number; ftpW: number }[];
  weightKg: number | null;
  runPace: { now: number | null; weeks4: number | null; weeks12: number | null } | null;
  workouts: LoggedWorkout[];
  /** The stats page's weeks (effective sets per group, the unit of the targets), oldest first, the current week last. */
  weeks: { sets: Partial<Record<MuscleGroup, number>> }[];
  targets: Record<MuscleGroup, { min: number; max: number }>;
};

/** At most one line per area, only where there is something to say. Plain words, no score. */
export function progressRows(i: Input): ProgressRow[] {
  const rows: ProgressRow[] = [];

  const ftp = [...i.ftp].sort((a, b) => a.atMs - b.atMs);
  const latest = ftp[ftp.length - 1];
  if (latest) {
    const back = [...ftp].reverse().find((h) => i.nowMs - h.atMs >= FTP_BACK_DAYS * DAY) ?? (ftp[0] && i.nowMs - ftp[0].atMs >= 14 * DAY ? ftp[0] : undefined);
    const wkg = i.weightKg ? ` · ${comma(latest.ftpW / i.weightKg)} W/kg` : '';
    const row: ProgressRow = { label: 'Fitter (Rad)', value: `FTP ${Math.round(latest.ftpW)} W${wkg}` };
    if (back && back !== latest) {
      const d = Math.round(latest.ftpW - back.ftpW);
      row.change = `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} W seit ${Math.max(1, Math.round((i.nowMs - back.atMs) / (7 * DAY)))} Wochen`;
    }
    rows.push(row);
  }

  const pace = i.runPace;
  if (pace?.now != null) {
    const row: ProgressRow = { label: 'Schneller (Laufen)', value: `Lockeres Tempo ${paceText(pace.now)}` };
    const [then, weeks] = pace.weeks12 != null ? [pace.weeks12, 12] : pace.weeks4 != null ? [pace.weeks4, 4] : [null, 0];
    if (then !== null) {
      const d = Math.round(pace.now - then);
      row.change = d === 0 ? `gleich wie vor ${weeks} Wochen` : `${Math.abs(d)} s ${d < 0 ? 'schneller' : 'langsamer'} als vor ${weeks} Wochen`;
    }
    rows.push(row);
  }

  // Strength: the most trained lifts of the last twelve weeks, the last four weeks against the eight before.
  const lifts = new Map<string, { title: string; latestMs: number; sessions: number; recent: number | null; before: number | null }>();
  for (const w of i.workouts) {
    const age = i.nowMs - w.startMs;
    if (age < 0 || age > BEFORE_DAYS * DAY) continue;
    for (const e of w.exercises) {
      const max = estimatedMax(e.sets.filter((s) => s.doneMs !== null || w.source === 'hevy'));
      if (max === null) continue;
      const l = lifts.get(e.exerciseId) ?? { title: e.title, latestMs: 0, sessions: 0, recent: null, before: null };
      l.sessions++;
      if (w.startMs > l.latestMs) { l.latestMs = w.startMs; l.title = e.title; }
      if (age <= RECENT_DAYS * DAY) l.recent = Math.max(l.recent ?? 0, max); else l.before = Math.max(l.before ?? 0, max);
      lifts.set(e.exerciseId, l);
    }
  }
  const top = [...lifts.values()].filter((l) => l.recent !== null).sort((a, b) => b.sessions - a.sessions || b.recent! - a.recent!).slice(0, MAX_LIFTS);
  if (top.length > 0) {
    rows.push({ label: 'Stärker (Kraft)', value: top.map((l) => `${l.title} ~${Math.round(l.recent!)} kg${l.before !== null ? ` (${signed(l.recent! - l.before)})` : ''}`).join(' · ') });
  }

  // Muscle: groups with a target, on average over the last four weeks in their band.
  const last4 = i.weeks.slice(-4);
  const groups = (Object.keys(i.targets) as MuscleGroup[]).filter((g) => i.targets[g].max > 0);
  const trained = last4.some((w) => Object.values(w.sets).some((n) => (n ?? 0) > 0));
  if (groups.length > 0 && trained && last4.length > 0) {
    const inBand = groups.filter((g) => {
      const avg = last4.reduce((a, w) => a + (w.sets[g] ?? 0), 0) / last4.length;
      return avg >= i.targets[g].min && avg <= i.targets[g].max;
    }).length;
    rows.push({ label: 'Muskelaufbau', value: `${inBand} von ${groups.length} Muskelgruppen im Zielbereich`, change: `Schnitt der letzten ${last4.length} Wochen` });
  }
  return rows;
}
