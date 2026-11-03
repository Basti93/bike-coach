import type { Complaint } from '../motivation';
import { RESTART_DAYS } from './limits';

const DAY_MS = 86_400_000;
export type ComplaintMode = 'pause' | 'half' | 'restart' | null;

/** Body regions that running loads. Lookarounds instead of \b, because \b does not see ß or ü as letters. */
export const RUN_REGION = /knie|(?<![a-zäöüß])fu(ß|ss)(?![a-zäöüß])|sprunggelenk|knöchel|schienbein|achilles|(?<![a-zäöüß])wade|hüfte|unterer rücken|lendenwirbel|\b(knee|foot|feet|ankle|shin|calf|calves|hip|lower back)\b/i;

/** Active pauses, healing halves, a complaint closed within the last days restarts gently. Active beats healing beats restart. */
export const runComplaintMode = (complaints: Complaint[], nowMs: number): ComplaintMode => {
  const own = complaints.filter((c) => RUN_REGION.test(c.text));
  if (own.some((c) => c.status === 'active')) return 'pause';
  if (own.some((c) => c.status === 'healing')) return 'half';
  if (own.some((c) => c.status === 'over' && nowMs - c.updatedMs < RESTART_DAYS * DAY_MS)) return 'restart';
  return null;
};
