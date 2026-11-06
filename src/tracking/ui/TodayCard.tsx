import type { ReactNode } from 'react';
import type { TrackedRecord } from '../../shared/records';
import { addDays, dayLabel, HARDNESS_LABEL, hasSport, planFor, SPORT_LABEL, type PlanDay } from '../../shared/week-plan';
import { dateKeyOf, runView } from './run-view';

const RUN_KIND: Record<string, string> = { easy: 'locker', long: 'lang', test: 'Test' };
/** One session: "Kraft, mittel". Two sessions of the same hardness: "Kraft + Rad locker", else each with its own. */
const label = (d: PlanDay) => {
  if (!d.also || d.sport === 'rest') return dayLabel(d, (_, first) => (first && d.long ? ', lang' : ''));
  if (d.also.hardness === d.hardness) return `${SPORT_LABEL[d.sport]} + ${SPORT_LABEL[d.also.sport]} ${HARDNESS_LABEL[d.hardness]}`;
  return `${SPORT_LABEL[d.sport]} ${HARDNESS_LABEL[d.hardness]} + ${SPORT_LABEL[d.also.sport]} ${HARDNESS_LABEL[d.also.hardness]}`;
};

/** Today's sport from the week plan, or null without a plan for today. */
export const todayPlan = (weekplans: TrackedRecord[] | null, nowMs: number): PlanDay | null => planFor(weekplans ?? [], dateKeyOf(nowMs));

/**
 * Heute from the week plan: what today is for, with the one thing to do for it, and tomorrow in a line. `gym` is the strength
 * plan card, shown on a strength day. Without a plan for today it shows nothing; the caller keeps its own view then.
 */
export function TodayCard({ weekplans, runs, nowMs, gym, onRun, bike }: {
  weekplans: TrackedRecord[] | null; runs: TrackedRecord[] | null; nowMs: number; gym: ReactNode; onRun?: () => void;
  /** On the Mac: the bike session to start; elsewhere a note that it starts on the Mac. */
  bike?: ReactNode;
}) {
  const today = todayPlan(weekplans, nowMs);
  if (!today) return null;
  const tomorrow = planFor(weekplans ?? [], addDays(today.date, 1));
  const run = hasSport(today, 'run') ? runView(runs ?? [], nowMs).week?.runs.find((r) => r.date === today.date) ?? null : null;
  return (
    <section className="card tk-today-card" aria-label="Heute laut Wochenplan">
      <h2>Heute: {label(today)}</h2>
      {today.note && <p className="muted">{today.note}</p>}
      {hasSport(today, 'gym') && gym}
      {hasSport(today, 'run') && (
        <>
          <p>{run ? `Lauf: ${run.minutes} Minuten ${RUN_KIND[run.kind] ?? ''}`.trim() : 'Ein Lauf nach Gefühl.'}</p>
          {onRun && <button type="button" onClick={onRun}>Zum Laufen</button>}
        </>
      )}
      {hasSport(today, 'bike') && (bike ?? <p>Die Radeinheit startest du am Mac.</p>)}
      {hasSport(today, 'mobility') && <p>Heute ist Beweglichkeit dran.</p>}
      {today.sport === 'rest' && <p>Ruhetag. Erholung gehört zum Training.</p>}
      {tomorrow && <p className="muted">Morgen: {label(tomorrow)}</p>}
    </section>
  );
}
