import type { TrackedRecord } from './records';
import { above } from './exercise-links';
import { ruleNumbers } from './training-policy';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PlanMode = 'week' | 'spontaneous';
/** `minutes`: the usual time per session (null: no statement). `today`: a lower time for one date only. */
export type FrameBody = { mode: PlanMode; minutes: number | null; today?: { date: string; minutes: number }; atMs: number };
export const DEFAULT_FRAME: Omit<FrameBody, 'atMs'> = { mode: 'week', minutes: null };

/** One frame per profile: record kind `frame`, id `frame`. */
export const FRAME_ID = 'frame';
const MODES: PlanMode[] = ['week', 'spontaneous'];
export const minuteChoices = (): number[] => ruleNumbers('frame.minute-choices');

/** The body of a `frame` record, or null for anything else. */
export function readFrame(body: unknown): FrameBody | null {
  if (!isObj(body) || !num(body.atMs) || !MODES.includes(body.mode as PlanMode)) return null;
  const choices = minuteChoices();
  if (body.minutes !== null && !(num(body.minutes) && choices.includes(body.minutes))) return null;
  let today: FrameBody['today'];
  if (body.today !== undefined) {
    const t = body.today;
    if (!isObj(t) || typeof t.date !== 'string' || !DATE.test(t.date) || !num(t.minutes) || !choices.includes(t.minutes)) return null;
    today = { date: t.date, minutes: t.minutes };
  }
  return { mode: body.mode as PlanMode, minutes: body.minutes as number | null, ...(today ? { today } : {}), atMs: body.atMs };
}

export const frameRecord = (f: Omit<FrameBody, 'atMs'>, nowMs: number, have?: TrackedRecord): TrackedRecord =>
  ({ kind: 'frame', id: FRAME_ID, updatedMs: above(nowMs, have), deleted: false, body: { ...f, atMs: nowMs } });

export type Frame = Omit<FrameBody, 'atMs'> & {
  /** The time for the given date: today's own value on its date, else the usual one. null: no limit. */
  effectiveMinutes: number | null;
};

/** The profile's frame; without a (readable) record: week mode and no time statement. `today` only counts on its date. */
export function frameOf(records: readonly TrackedRecord[], todayDate: string): Frame {
  const r = records.find((x) => x.kind === 'frame' && x.id === FRAME_ID && !x.deleted);
  const f = r ? readFrame(r.body) : null;
  const base = f ? { mode: f.mode, minutes: f.minutes, ...(f.today ? { today: f.today } : {}) } : { ...DEFAULT_FRAME };
  const effectiveMinutes = base.today && base.today.date === todayDate ? base.today.minutes : base.minutes;
  return { ...base, effectiveMinutes };
}
