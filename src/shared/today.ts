import type { DayRating } from './day-rating';
import type { PlanMode } from './frame';
import type { Prio, SportKey } from './personal';
import { addDays, dayHardness, dayLabel, dayParts, SPORT_LABEL, type AlsoPart, type Hardness, type PlanDay, type Sport } from './week-plan';
import { ruleNumber } from './training-policy';

/**
 * What fits today, from plain data: the past days' load, today's plan day, the goal, the frame and (optionally) the body's
 * state. Pure and without AI, so the app and the coaches say the same. The advice only looks at today's plan day and the past:
 * a missed plan day is never carried over.
 */
export type TodayInput = {
  date: string;
  /** Rated past days (see day-rating). Missing days count as not trained. */
  ratings: Record<string, DayRating>;
  planDay?: PlanDay | null;
  goal: { sports: Partial<Record<SportKey, Prio>> };
  frame: { mode: PlanMode };
  readiness?: { restingHrRaised?: boolean };
};

export type TodayAdvice = {
  sport: Sport; hardness: Hardness; also?: AlsoPart;
  /** The session(s) in words: "Kraft, mittel + Rad, locker". */
  label: string;
  /** One German clause: "weil …" or "laut deinem Wochenplan". */
  reason: string;
  /** "<label> – <reason>" */
  line: string;
  /** True when this is today's plan day unchanged; then a reason adds nothing. */
  fromPlan: boolean;
};

const SPORT_KEYS: readonly SportKey[] = ['gym', 'bike', 'run'];
const NUMBER_WORD: Record<number, string> = { 2: 'zwei', 3: 'drei', 4: 'vier' };
type Parts = AlsoPart[];

const asDay = (date: string, parts: Parts, legs?: boolean): PlanDay => ({
  date, sport: parts[0]!.sport, hardness: parts[0]!.hardness, fixed: false, ...(legs !== undefined ? { legs } : {}),
  ...(parts[1] ? { also: parts[1] } : {}),
});
const mapParts = (parts: Parts, f: (p: AlsoPart) => AlsoPart): Parts => {
  const out = parts.map(f);
  return out[1] && out[1].sport === out[0]!.sport ? [out[0]!] : out;
};
const same = (a: Parts, b: Parts): boolean => a.length === b.length && a.every((p, i) => p.sport === b[i]!.sport && p.hardness === b[i]!.hardness);
const REST: Parts = [{ sport: 'rest', hardness: 'easy' }];

export function todayAdvice(input: TodayInput): TodayAdvice {
  const { date, ratings, goal } = input;
  const before = (n: number): DayRating | undefined => ratings[addDays(date, -n)];
  const legsHardYesterday = before(1)?.legs === true && before(1)?.hardness === 'hard';
  const plan = input.frame.mode === 'week' ? input.planDay ?? null : null;

  // The starting point: the plan day, else the sport done least recently, at moderate.
  let parts: Parts;
  let reason: string;
  if (plan) {
    parts = dayParts(plan);
    reason = 'laut deinem Wochenplan';
  } else {
    const lastDone = (s: SportKey): string =>
      Object.values(ratings).filter((r) => r.date < date && r.sports?.includes(s)).reduce((m, r) => (r.date > m ? r.date : m), '');
    let pool = SPORT_KEYS.filter((s) => goal.sports[s] !== undefined || lastDone(s) !== '');
    if (pool.length === 0) pool = [...SPORT_KEYS];
    if (legsHardYesterday && pool.some((s) => s !== 'gym')) pool = pool.filter((s) => s !== 'gym');
    const focus = pool.filter((s) => goal.sports[s] === 'focus');
    const from = focus.length > 0 ? focus : pool;
    const pick = from.reduce((best, s) => (lastDone(s) < lastDone(best) ? s : best));
    parts = [{ sport: pick, hardness: 'moderate' }];
    reason = `weil du ${SPORT_LABEL[pick]} am längsten nicht gemacht hast`;
  }

  // Protective rules, in order; the first that changes the day gives the reason.
  const hardLegPart = (p: AlsoPart): boolean => p.hardness === 'hard' || (plan === null && p.sport === 'gym');
  const hardInRow = ruleNumber('today.hard-days-in-row');
  const restAfter = ruleNumber('today.rest-after-days');
  const hardRun = Array.from({ length: hardInRow }, (_, i) => before(i + 1)?.hardness === 'hard').every(Boolean);
  const noBreak = Array.from({ length: restAfter }, (_, i) => before(i + 1)?.hardness != null).every(Boolean);
  const day = asDay(date, parts, plan?.legs);
  const protective: { to: Parts; reason: string }[] = [
    { to: dayHardness(day) === 'hard' ? REST : mapParts(parts, (p) => (p.sport === 'rest' ? p : { sport: p.sport, hardness: 'easy' })), reason: 'weil dein Ruhepuls erhöht ist' },
    { to: mapParts(parts, (p) => (hardLegPart(p) ? (p.sport === 'gym' ? { sport: 'mobility', hardness: 'easy' } : { sport: p.sport, hardness: 'moderate' }) : p)), reason: 'weil deine Beine gestern hart gearbeitet haben' },
    { to: mapParts(parts, (p) => (p.sport === 'rest' ? p : { sport: p.sport, hardness: 'easy' })), reason: `weil du ${NUMBER_WORD[hardInRow] ?? hardInRow} harte Tage hintereinander hattest` },
    { to: REST, reason: `weil du seit ${restAfter} Tagen ohne Pause trainierst` },
  ];
  const active = [input.readiness?.restingHrRaised === true, legsHardYesterday, hardRun, noBreak];
  let fromPlan = plan !== null;
  const hit = protective.find((r, i) => active[i] && !same(r.to, parts));
  if (hit) { parts = hit.to; reason = hit.reason; fromPlan = false; }

  const [first, also] = parts as [AlsoPart, AlsoPart?];
  const label = dayLabel(asDay(date, parts));
  return { sport: first.sport, hardness: first.hardness, ...(also ? { also } : {}), label, reason, line: `${label} – ${reason}`, fromPlan };
}
