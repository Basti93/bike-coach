import type { DayRating } from '../day-load';
import { addWeeks, dateKey, dateOf, dayIndex, weekOf } from '../../shared/meals';
import type { PlannedRun, RunAnswers, RunKind } from '../../shared/run';
import type { ComplaintMode } from './complaints';
import type { Run } from './garmin-runs';
import { capFor, startPoint } from './numbers';
import {
  DEFAULT_MIN, DEFAULT_RUNS, GAP_DAYS, HALF, LIGHT_EVERY, LIGHT_FACTOR, LONG_SHARE, LONG_STEP_MIN, MAX_RAMP, MAX_RUNS, MAX_RUN_MIN,
  MIN_RUN_MIN, PHASE2_OF, PHASE2_RUNS, PHASE2_WEEKS, TEST_COOL_MIN, TEST_EVERY_DAYS, TEST_LOAD, TEST_MAIN_MIN, TEST_WARM_MIN,
} from './limits';

const DAY = 86_400_000;
/** The ramp compares with the mean of this many complete weeks before the planned one. */
const BASE_WEEKS = 3;
const TEST_MIN = TEST_WARM_MIN + TEST_MAIN_MIN + TEST_COOL_MIN;

export type Phase = { phase: 1 | 2; since: string };
export type RuleInput = {
  nowMs: number; week: string; fromDate: string; runs: Run[]; weekdays: number[]; answers: RunAnswers | null; maxHr: number | null;
  complaint: ComplaintMode; days: Record<string, DayRating>; crossCut: (minutes: number) => number; lastTestMs: number | null; phase: Phase;
};
export type RuleWeek = { runs: PlannedRun[]; reason: string; phase: 1 | 2; totalMinutes: number; maxRunMinutes: number; testDate: string | null };

/** The seven local dates of a week, Monday first. Built from noon, so a daylight-saving change cannot skip or repeat a date. */
export const weekDates = (week: string): string[] => Array.from({ length: 7 }, (_, i) => dateKey(dateOf(week, i)));

const shift = (date: string, days: number): string => dateKey(dateOf(date, days));
const weekdayOf = (date: string): number => dayIndex(dateOf(date, 0).getTime());
const weekStartMs = (week: string): number => {
  const d = dateOf(week, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Phase 1 ("wieder fit") until at least 3 runs a week in 4 of the last 5 complete weeks, with no active run complaint in a
 * week that counts; then phase 2 ("Distanz") from that Monday. 21 days without a run start phase 1 again, from that day.
 */
export const phaseOf = (runs: Run[], activeComplaintWeeks: Set<string>, nowMs: number): Phase => {
  const current = weekOf(nowMs);
  const times = runs.map((r) => r.startMs).filter((t) => t <= nowMs).sort((a, b) => a - b);
  if (times.length === 0) return { phase: 1, since: current };
  const perWeek = new Map<string, number>();
  for (const t of times) perWeek.set(weekOf(t), (perWeek.get(weekOf(t)) ?? 0) + 1);
  const counts = (w: string): boolean => (perWeek.get(w) ?? 0) >= PHASE2_RUNS && !activeComplaintWeeks.has(w);

  const gap = GAP_DAYS * DAY;
  const resets: number[] = [];
  for (let i = 1; i < times.length; i++) if (times[i]! - times[i - 1]! >= gap) resets.push(times[i - 1]! + gap);
  const last = times[times.length - 1]!;
  if (nowMs - last >= gap) resets.push(last + gap);

  let phase: 1 | 2 = 1;
  let since = weekOf(times[0]!);
  let next = 0;
  const applyResets = (untilMs: number): void => {
    for (; next < resets.length && resets[next]! <= untilMs; next++) {
      phase = 1;
      since = dateKey(new Date(resets[next]!));
    }
  };
  for (let w = addWeeks(weekOf(times[0]!), 1); w <= current; w = addWeeks(w, 1)) {
    applyResets(weekStartMs(w));
    if (phase === 2) continue;
    let good = 0;
    for (let k = 1; k <= PHASE2_OF; k++) if (counts(addWeeks(w, -k))) good++;
    if (good >= PHASE2_WEEKS) {
      phase = 2;
      since = w;
    }
  }
  applyResets(nowMs);
  return { phase, since };
};

/** Every fourth week of a phase, counted from the week the phase began. */
const isLight = (week: string, since: string): boolean => {
  const idx = Math.round((dateOf(week, 0).getTime() - dateOf(weekOf(dateOf(since, 0).getTime()), 0).getTime()) / (7 * DAY));
  return idx >= 0 && idx % LIGHT_EVERY === LIGHT_EVERY - 1;
};

/** Which number counts today, said before the run. */
export const countsText = (kind: RunKind, minutes: number, hrCap: number | null, hasTrend: boolean): string => {
  if (kind === 'test') {
    return `${TEST_WARM_MIN} Minuten einlaufen, ${TEST_MAIN_MIN} Minuten gleichmäßig zügig, ${TEST_COOL_MIN} Minuten auslaufen. `
      + `Heute zählt die Strecke in den ${TEST_MAIN_MIN} Minuten.`;
  }
  const calm = hrCap !== null ? `Puls unter ${hrCap}` : 'so, dass du dich noch unterhalten kannst';
  const trend = hasTrend && hrCap !== null ? ' Über die Wochen zeigt sich dein Fortschritt im Tempo bei gleichem Puls.' : '';
  if (kind === 'long') return `${minutes} Minuten lang und ruhig, ${calm}. Heute zählt die Zeit, nicht das Tempo.${trend}`;
  return `${minutes} Minuten ruhig, ${calm}.${trend}`;
};

const TEST_NOTE = 'Der Testlauf ist ein Angebot. Wenn du dich heute nicht frisch fühlst, lauf einfach ruhig.';

type Slot = { date: string; kind: RunKind; minutes: number };

/**
 * The week by rules alone, safe without Claude. In order: base, ramp, light week, complaint, cross-sport cut, then the
 * minutes are spread over the chosen weekdays from `fromDate` on.
 */
export const ruleWeek = (input: RuleInput): RuleWeek => {
  const { phase } = input.phase;
  const chosen = weekDates(input.week).filter((d) => input.weekdays.includes(weekdayOf(d)));
  const open = chosen.filter((d) => d >= input.fromDate);

  // Base: the mean of the last complete weeks, else the answers, else 2 × 20 minutes.
  const baseWeeks = new Set(Array.from({ length: BASE_WEEKS }, (_, i) => addWeeks(input.week, i - BASE_WEEKS)));
  const recent = input.runs.filter((r) => r.startMs <= input.nowMs && baseWeeks.has(weekOf(r.startMs)));
  const a = input.answers;
  const answered = a !== null && a.runsPerWeek > 0 && a.usualMinutes > 0;
  const startRuns = answered ? a.runsPerWeek : DEFAULT_RUNS;
  const startMin = answered ? a.usualMinutes : DEFAULT_MIN;
  let total: number;
  let longest: number;
  let desired: number;
  if (recent.length > 0) {
    const base = recent.reduce((s, r) => s + r.durationS / 60, 0) / BASE_WEEKS;
    // Ramp; a few short runs never plan less than a gentle start.
    // Whole minutes, rounded down (the epsilon keeps 100 × 1.1 at 110).
    total = Math.max(Math.floor(base * (1 + MAX_RAMP) + 1e-9), Math.min(startRuns * startMin, DEFAULT_RUNS * DEFAULT_MIN));
    longest = Math.max(...recent.map((r) => r.durationS / 60));
    desired = input.weekdays.length;
  } else {
    total = startRuns * startMin;
    longest = startMin;
    desired = startRuns;
  }

  const light = isLight(input.week, input.phase.since);
  if (light) total *= LIGHT_FACTOR;
  const mode: ComplaintMode = input.complaint ?? (a?.pain ? 'half' : null);
  if (mode === 'pause') total = 0;
  else if (mode !== null) total *= HALF;
  if (total > 0) total = Math.max(0, total - input.crossCut(total));
  // Switched on or replanned mid-week: only the share of the open days, so missed minutes never move to later days.
  if (chosen.length > 0) total *= open.length / chosen.length;

  // No run longer than 10 minutes over the longest recent one.
  const cap = Math.min(MAX_RUN_MIN, Math.max(MIN_RUN_MIN, Math.floor(longest + LONG_STEP_MIN)));
  const hard = (d: string): number => (input.days[d]?.hardness === 'hard' ? 1 : 0);
  const prefer = (ds: string[]): string[] => [...ds].sort((x, y) => hard(x) - hard(y) || (x < y ? -1 : x > y ? 1 : 0));
  const n = Math.min(desired, open.length, MAX_RUNS, Math.floor(total / MIN_RUN_MIN));
  const picked = prefer(open).slice(0, n).sort();

  // A test run: due, not in a light week, not with a complaint or pain, and only on a fresh day.
  const firstRun = input.runs.reduce<number | null>((m, r) => (r.startMs <= input.nowMs && (m === null || r.startMs < m) ? r.startMs : m), null);
  const lastTest = input.lastTestMs ?? firstRun;
  const due = lastTest !== null && input.nowMs - lastTest >= TEST_EVERY_DAYS * DAY;
  const fresh = (d: string): boolean => {
    const own = input.days[d]?.hardness ?? null;
    const before = input.days[shift(d, -1)];
    const after = input.days[shift(d, 1)];
    return (own === null || own === 'easy') && !before?.legs && before?.hardness !== 'hard' && after?.hardness !== 'hard';
  };
  let testDate: string | null = null;
  if (due && !light && mode === null && total >= TEST_LOAD * TEST_MIN) {
    const candidates = phase === 2 && picked.length >= 2 ? picked.slice(0, -1) : picked;
    testDate = candidates.find(fresh) ?? null;
  }

  const place = (budget: number, ds: string[]): Slot[] => {
    for (let k = Math.min(ds.length, Math.floor(budget / MIN_RUN_MIN)); k > 0; k--) {
      const use = prefer(ds).slice(0, k).sort();
      if (phase === 2 && k >= 2) {
        const long = Math.floor(Math.min(Math.max(budget * LONG_SHARE, budget / k), cap));
        const each = Math.floor(Math.min((budget - long) / (k - 1), long));
        if (each >= MIN_RUN_MIN) return use.map((date, i) => ({ date, kind: i === k - 1 ? 'long' : 'easy', minutes: i === k - 1 ? long : each }));
      } else {
        const each = Math.floor(Math.min(budget / k, cap));
        if (each >= MIN_RUN_MIN) return use.map((date) => ({ date, kind: 'easy', minutes: each }));
      }
    }
    return [];
  };
  const slots = place(testDate ? total - TEST_LOAD * TEST_MIN : total, picked.filter((d) => d !== testDate));
  if (testDate) slots.push({ date: testDate, kind: 'test', minutes: TEST_MIN });
  slots.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const hrCap = capFor(input.maxHr);
  const hasTrend = startPoint(input.runs, input.nowMs).easyPace !== null;
  const runs: PlannedRun[] = slots.map((s) => {
    const cap = s.kind === 'test' ? null : hrCap;
    return { date: s.date, kind: s.kind, minutes: s.minutes, hrCap: cap, counts: countsText(s.kind, s.minutes, cap, hasTrend), note: s.kind === 'test' ? TEST_NOTE : null };
  });

  return {
    runs,
    reason: reasonText(phase, { mode, light, empty: runs.length === 0, test: testDate !== null }),
    phase,
    totalMinutes: runs.reduce((s, r) => s + r.minutes * (r.kind === 'test' ? TEST_LOAD : 1), 0),
    maxRunMinutes: runs.reduce((m, r) => Math.max(m, r.minutes), 0),
    testDate,
  };
};

/** One calm sentence that names the phase. */
const reasonText = (phase: 1 | 2, w: { mode: ComplaintMode; light: boolean; empty: boolean; test: boolean }): string => {
  const name = phase === 1 ? 'Phase „wieder fit“' : 'Phase „Distanz“';
  if (w.mode === 'pause') return `${name}: Diese Woche pausiert das Laufen.`;
  if (w.mode !== null) return `${name}: Diese Woche ist der Plan sanft, mit halber Zeit.`;
  if (w.empty) return `${name}: Für diese Woche ist kein Lauftag mehr frei.`;
  if (w.light) return `${name}: Eine leichtere Woche, damit Erholung Platz hat.`;
  const test = w.test ? ', dazu ein Testlauf als Messpunkt' : '';
  return phase === 1
    ? `${name}: Ruhige Läufe, die Wochenzeit steigt behutsam${test}.`
    : `${name}: Der lange Lauf wächst behutsam, die anderen Läufe bleiben ruhig${test}.`;
};
