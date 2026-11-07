import type { TrackedRecord } from '../../shared/records';
import { frameOf, type Frame } from '../../shared/frame';
import { dateKey } from '../../shared/day-rating';
import { nextPlanDate } from '../../shared/week-plan';

type Reader = { all(profileId: string, kind?: 'frame' | 'weekplan' | 'workout'): TrackedRecord[] };

const isFinished = (b: unknown): boolean => typeof b === 'object' && b !== null && typeof (b as { startMs?: unknown }).startMs === 'number' && typeof (b as { endMs?: unknown }).endMs === 'number';

/** Read only, like the goal: the coaches never write the person's frame. Unreadable: no frame (week mode, no time). */
export function frameOfProfile(store: Reader, profileId: string, todayDate: string): Frame {
  try { return frameOf(store.all(profileId, 'frame'), todayDate); } catch { return frameOf([], todayDate); }
}

/**
 * The minutes for the gym session the coach plans: the person's time on the day it is planned for (the next gym day of the
 * week plan, else today). null: no time given.
 */
export function gymBudgetOf(store: Reader, profileId: string, todayDate: string): number | null {
  try {
    // A day whose strength session is already done needs no plan.
    const done = new Set(store.all(profileId, 'workout').filter((r) => !r.deleted && isFinished(r.body)).map((r) => dateKey((r.body as { startMs: number }).startMs)));
    const date = nextPlanDate(store.all(profileId, 'weekplan'), todayDate, 'gym', (d) => done.has(d)) ?? todayDate;
    return frameOf(store.all(profileId, 'frame'), date).effectiveMinutes;
  } catch { return null; }
}
