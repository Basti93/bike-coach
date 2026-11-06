import type { TrackedRecord } from '../../shared/records';
import { frameOf, type Frame } from '../../shared/frame';
import { nextPlanDate } from '../../shared/week-plan';

type Reader = { all(profileId: string, kind?: 'frame' | 'weekplan'): TrackedRecord[] };

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
    const date = nextPlanDate(store.all(profileId, 'weekplan'), todayDate, 'gym') ?? todayDate;
    return frameOf(store.all(profileId, 'frame'), date).effectiveMinutes;
  } catch { return null; }
}
