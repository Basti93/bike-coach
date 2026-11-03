import { isWeekKey } from './meals';
export const RUN_TYPES = ['running', 'trail_running', 'track_running', 'treadmill_running'] as const;
export type RunType = typeof RUN_TYPES[number];
/** Only these have a pace worth comparing: no hills, no belt. */
export const PACE_TYPES: readonly RunType[] = ['running', 'track_running'];
export type RunKind = 'easy' | 'long' | 'test';
export type PlannedRun = { date: string; kind: RunKind; minutes: number; hrCap: number | null; counts: string; note: string | null };

// ---- Run records: bodies, ids, reader ----

export type RunGarmin = { status: 'none' | 'sending' | 'sent' | 'changed' | 'stale' | 'failed'; reason: string | null; confirmedMs: number | null; sent: Record<string, { workoutId: string; scheduleId: string | null; fp: string }> };
export type RunWeekBody = { type: 'week'; week: string; announce: boolean; atMs: number; phase: 1 | 2; source: 'rules' | 'claude'; reason: string; note: string | null; runs: (PlannedRun & { fp: string; done: string | null })[]; garmin: RunGarmin | null };
export type RunAnswers = { runsPerWeek: number; usualMinutes: number; pain: boolean };
export type RunSettingsBody = { type: 'settings'; on: boolean; weekdays: number[] | null; answers: RunAnswers | null };
export type ManualRunBody = { type: 'manual'; startMs: number; durationS: number; distanceM: number; avgHr: number | null; runType: RunType };
export type RunSendBody = { type: 'send'; week: string; fp: string; atMs: number };
export type RunNumbers = { easyPace: { now: number | null; weeks4: number | null; weeks12: number | null; trend: (number | null)[] }; weeks: { week: string; km: number; minutes: number; plannedMinutes: number | null }[]; longest: { blockKm: number | null; lastBlockKm: number | null }; tests: { date: string; distanceM: number }[] };
export type RunCard = { runId: string; date: string; kind: RunKind | 'unplanned'; counted: string; result: string; sentence: string };
export type RunStatusBody = { type: 'status'; atMs: number; on: boolean; suggest: boolean; needsAnswers: boolean; suggestedDays: number[]; hrCap: number | null; complaint: 'pause' | 'half' | 'restart' | null; numbers: RunNumbers; card: RunCard | null };
export type RunReviewBody = { type: 'review'; week: string; atMs: number; km: number; minutes: number; plannedMinutes: number | null; runs: number; longestKm: number | null; easyPace: { now: number | null; weeks4: number | null } | null; testM: number | null; focus: string };
export type RunBody = RunWeekBody | RunSettingsBody | ManualRunBody | RunSendBody | RunStatusBody | RunReviewBody;

export const RUN_SETTINGS_ID = 'settings';
export const RUN_STATUS_ID = 'status';
export const runWeekId = (week: string): string => `week-${week}`;
export const runSendId = (week: string): string => `send-${week}`;
export const runReviewId = (week: string): string => `review-${week}`;
export const manualRunId = (uuid: string): string => `manual-${uuid}`;

/** The body type a record id must carry, or null for an id that is no run id. */
export function runIdType(id: string): RunBody['type'] | null {
  if (id === RUN_SETTINGS_ID) return 'settings';
  if (id === RUN_STATUS_ID) return 'status';
  const m = /^(week|send|review)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (m) return isWeekKey(m[2]) ? m[1] as 'week' | 'send' | 'review' : null;
  return /^manual-.{1,100}$/.test(id) ? 'manual' : null;
}

export const runFp = (r: PlannedRun): string => JSON.stringify([r.date, r.kind, r.minutes, r.hrCap]);
export const weekFp = (runs: { fp: string }[]): string => runs.map((r) => r.fp).join('|');

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const nn = (x: unknown): boolean => fin(x) && x >= 0;
const optNn = (x: unknown): boolean => x === null || nn(x);
const optFin = (x: unknown): boolean => x === null || fin(x);
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const optText = (x: unknown, max: number): boolean => x === null || text(x, max);
const dateKeyOk = (x: unknown): boolean => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const list = (x: unknown, max: number): x is unknown[] => Array.isArray(x) && x.length <= max;
const RUN_KINDS: readonly string[] = ['easy', 'long', 'test'];
const GARMIN_STATUS: readonly string[] = ['none', 'sending', 'sent', 'changed', 'stale', 'failed'];

const plannedOk = (r: unknown): boolean => isObj(r) && dateKeyOk(r.date) && RUN_KINDS.includes(r.kind as string) && nn(r.minutes) && optNn(r.hrCap) && text(r.counts, 400) && optText(r.note, 400) && text(r.fp, 400) && (r.done === null || text(r.done, 200));
const garminOk = (g: unknown): boolean => {
  if (g === null) return true;
  if (!isObj(g) || !GARMIN_STATUS.includes(g.status as string) || !optText(g.reason, 400) || !optNn(g.confirmedMs) || !isObj(g.sent)) return false;
  const e = Object.entries(g.sent);
  return e.length <= 14 && e.every(([k, v]) => k.length <= 100 && isObj(v) && text(v.workoutId, 100) && optText(v.scheduleId, 100) && text(v.fp, 400));
};
const numsOrNull = (x: unknown): boolean => list(x, 60) && x.every(optFin);
const numbersOk = (n: unknown): boolean => {
  if (!isObj(n) || !isObj(n.easyPace) || !isObj(n.longest)) return false;
  const e = n.easyPace;
  return optFin(e.now) && optFin(e.weeks4) && optFin(e.weeks12) && numsOrNull(e.trend)
    && list(n.weeks, 60) && n.weeks.every((w) => isObj(w) && isWeekKey(w.week) && nn(w.km) && nn(w.minutes) && optNn(w.plannedMinutes))
    && optNn(n.longest.blockKm) && optNn(n.longest.lastBlockKm)
    && list(n.tests, 60) && n.tests.every((t) => isObj(t) && dateKeyOk(t.date) && nn(t.distanceM));
};
const cardOk = (c: unknown): boolean => c === null || (isObj(c) && text(c.runId, 200) && dateKeyOk(c.date) && (RUN_KINDS.includes(c.kind as string) || c.kind === 'unplanned') && text(c.counted, 400) && text(c.result, 400) && text(c.sentence, 600));

/** Strict per `type`: the reader of every run body. Anything odd gives null. */
export function readRunBody(body: unknown): RunBody | null {
  if (!isObj(body)) return null;
  const b = body;
  switch (b.type) {
    case 'week': return isWeekKey(b.week) && typeof b.announce === 'boolean' && nn(b.atMs) && (b.phase === 1 || b.phase === 2) && (b.source === 'rules' || b.source === 'claude')
      && text(b.reason, 1000) && optText(b.note, 1000) && list(b.runs, 14) && b.runs.every(plannedOk) && garminOk(b.garmin) ? b as RunWeekBody : null;
    case 'settings': {
      const a = b.answers;
      return typeof b.on === 'boolean'
        && (b.weekdays === null || (list(b.weekdays, 7) && b.weekdays.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)))
        && (a === null || (isObj(a) && nn(a.runsPerWeek) && (a.runsPerWeek as number) <= 14 && nn(a.usualMinutes) && (a.usualMinutes as number) <= 600 && typeof a.pain === 'boolean')) ? b as RunSettingsBody : null;
    }
    case 'manual': return nn(b.startMs) && nn(b.durationS) && nn(b.distanceM) && optNn(b.avgHr) && RUN_TYPES.includes(b.runType as RunType) ? b as ManualRunBody : null;
    case 'send': return isWeekKey(b.week) && text(b.fp, 2000) && nn(b.atMs) ? b as RunSendBody : null;
    case 'status': return nn(b.atMs) && typeof b.on === 'boolean' && typeof b.suggest === 'boolean' && typeof b.needsAnswers === 'boolean'
      && list(b.suggestedDays, 7) && b.suggestedDays.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) && optNn(b.hrCap)
      && (b.complaint === null || b.complaint === 'pause' || b.complaint === 'half' || b.complaint === 'restart') && numbersOk(b.numbers) && cardOk(b.card) ? b as RunStatusBody : null;
    case 'review': {
      const e = b.easyPace;
      return isWeekKey(b.week) && nn(b.atMs) && nn(b.km) && nn(b.minutes) && optNn(b.plannedMinutes) && nn(b.runs) && optNn(b.longestKm)
        && (e === null || (isObj(e) && optFin(e.now) && optFin(e.weeks4))) && optNn(b.testM) && text(b.focus, 1000) ? b as RunReviewBody : null;
    }
    default: return null;
  }
}

/** "6:12 /km". */
export const paceText = (sPerKm: number): string => {
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km`;
};
/** "5,2 km". */
export const kmText = (m: number): string => `${(Math.round(m / 100) / 10).toFixed(1).replace('.', ',')} km`;
