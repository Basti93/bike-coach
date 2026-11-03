import type { TrackedRecord } from './records';

/**
 * The week plan across the sports: per day one sport (or rest), how hard the day may be, and whether the day is fixed by the
 * rider. The coaches keep deciding what a session holds; the plan only says which sport on which day and how hard.
 */
export type Sport = 'bike' | 'gym' | 'run' | 'mobility' | 'rest';
export type Hardness = 'easy' | 'moderate' | 'hard';
export type PlanDay = { date: string; sport: Sport; hardness: Hardness; fixed: boolean; legs?: boolean; long?: boolean; note?: string };
export type WeekProposal = { weekStart: string; days: PlanDay[] };
/** The `weekplan` record, id = weekStart. Written only by the rider's device when they take a proposal. */
export type WeekPlanBody = WeekProposal & { fromMessage: string; acceptedMs: number };

export const SPORTS: readonly Sport[] = ['bike', 'gym', 'run', 'mobility', 'rest'];
export const SPORT_LABEL: Record<Sport, string> = { bike: 'Rad', gym: 'Kraft', run: 'Laufen', mobility: 'Beweglichkeit', rest: 'Ruhetag' };
export const HARDNESS_LABEL: Record<Hardness, string> = { easy: 'locker', moderate: 'mittel', hard: 'hart' };
export const WEEKDAY_LABEL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const HARDNESSES: readonly Hardness[] = ['easy', 'moderate', 'hard'];
const MAX_HARD_DAYS = 2;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y!, m! - 1, d!); };
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (key: string, n: number): string => { const d = toDate(key); d.setDate(d.getDate() + n); return keyOf(d); };
/** The Monday of a date's week (local dates). */
export const mondayOf = (key: string): string => addDays(key, -((toDate(key).getDay() + 6) % 7));
export const weekDates = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/**
 * The shared rules, checked by code: at most two hard days; no hard bike or run day the day after a hard leg day; the long
 * session not the day after a leg day. One sport per day is given by the shape. Returns what is broken, in plain German.
 */
export function checkWeekPlan(days: PlanDay[]): string[] {
  const out: string[] = [];
  if (days.filter((d) => d.sport !== 'rest' && d.hardness === 'hard').length > MAX_HARD_DAYS) out.push('Mehr als zwei harte Tage in der Woche.');
  days.forEach((d, i) => {
    const before = days[i - 1];
    if (!before || before.sport !== 'gym' || !before.legs) return;
    const name = WEEKDAY_LABEL[(toDate(d.date).getDay() + 6) % 7];
    if (before.hardness === 'hard' && (d.sport === 'bike' || d.sport === 'run') && d.hardness === 'hard') out.push(`Harter Rad- oder Lauftag am Tag nach einem harten Beintag (${name}).`);
    if (d.long && (d.sport === 'bike' || d.sport === 'run')) out.push(`Lange Einheit am Tag nach einem Beintag (${name}).`);
  });
  return out;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A proposal from Claude or a record: seven days of the week starting on its Monday, every field valid. Null otherwise. */
export function parseProposal(x: unknown): WeekProposal | null {
  if (!isObj(x) || typeof x.weekStart !== 'string' || !DATE.test(x.weekStart) || mondayOf(x.weekStart) !== x.weekStart || !Array.isArray(x.days)) return null;
  const dates = weekDates(x.weekStart);
  if (x.days.length !== 7) return null;
  const days: PlanDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = x.days[i];
    if (!isObj(d) || d.date !== dates[i] || !SPORTS.includes(d.sport as Sport) || !HARDNESSES.includes(d.hardness as Hardness)) return null;
    const day: PlanDay = { date: dates[i]!, sport: d.sport as Sport, hardness: d.hardness as Hardness, fixed: d.fixed === true };
    if (d.legs === true) day.legs = true; else if (d.legs === false) day.legs = false;
    if (d.long === true) day.long = true;
    if (typeof d.note === 'string' && d.note.trim()) day.note = d.note.trim().slice(0, 120);
    days.push(day);
  }
  return { weekStart: x.weekStart, days };
}

/** The accepted plan of a week, or null. */
export function planOfWeek(records: TrackedRecord[], monday: string): WeekPlanBody | null {
  const r = records.find((x) => x.kind === 'weekplan' && x.id === monday && !x.deleted);
  if (!r || !isObj(r.body)) return null;
  const p = parseProposal(r.body);
  return p ? { ...p, fromMessage: String(r.body.fromMessage ?? ''), acceptedMs: Number(r.body.acceptedMs ?? 0) } : null;
}
/** The planned day of a date, or null without a plan for its week. */
export const planFor = (records: TrackedRecord[], date: string): PlanDay | null =>
  planOfWeek(records, mondayOf(date))?.days.find((d) => d.date === date) ?? null;
