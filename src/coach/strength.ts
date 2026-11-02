import type { StrengthWorkout } from './hevy';

const DAY_MS = 86_400_000;
const RECENT_DAYS = 14;
const MAX_RECENT = 8;
const MAX_EXERCISES = 8;
const MAX_MONTHS = 24;

/** Bounded however long the history gets: the last two weeks in detail, older months only as totals. */
export const strengthPromptData = (workouts: StrengthWorkout[], nowMs: number): object | null => {
  if (workouts.length === 0) return null;
  const from = nowMs - RECENT_DAYS * DAY_MS;
  const letzte14Tage = workouts.filter((w) => w.startMs >= from).slice(-MAX_RECENT).map((w) => ({
    tag: new Date(w.startMs).toISOString().slice(0, 10), titel: w.title, minuten: Math.round(w.durationS / 60),
    uebungen: w.exercises.slice(0, MAX_EXERCISES).map((e) => ({ name: e.title, saetze: e.sets, wdh: e.reps, volumenKg: e.volumeKg })),
  }));
  const months = new Map<string, { monat: string; anzahl: number; stunden: number; volumenKg: number }>();
  for (const w of workouts.filter((x) => x.startMs < from)) {
    const monat = new Date(w.startMs).toISOString().slice(0, 7);
    const row = months.get(monat) ?? { monat, anzahl: 0, stunden: 0, volumenKg: 0 };
    row.anzahl += 1;
    row.stunden += w.durationS / 3600;
    row.volumenKg += w.exercises.reduce((a, e) => a + e.volumeKg, 0);
    months.set(monat, row);
  }
  const oldest = new Date(nowMs);
  oldest.setUTCMonth(oldest.getUTCMonth() - MAX_MONTHS, 1);
  const first = oldest.toISOString().slice(0, 7);
  const monate = [...months.values()]
    .filter((m) => m.monat >= first)
    .sort((a, b) => a.monat.localeCompare(b.monat))
    .map((m) => ({ ...m, stunden: Math.round(m.stunden * 10) / 10 }));
  return { letzte14Tage, monate };
};
