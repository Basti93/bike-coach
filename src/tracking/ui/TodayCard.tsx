import { useState, type ReactNode } from 'react';
import type { TrackedRecord } from '../../shared/records';
import { addDays, dayLabel, HARDNESS_LABEL, hasSport, planFor, SPORT_LABEL, type PlanDay } from '../../shared/week-plan';
import type { TrackingPort } from '../ports';
import { TodayOnly } from './FrameControls';
import { useTodayAdvice } from './frame-hooks';
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

type Props = {
  weekplans: TrackedRecord[] | null; runs: TrackedRecord[] | null; nowMs: number; gym: ReactNode; onRun?: () => void;
  /** On the Mac: the bike session to start; elsewhere a note that it starts on the Mac. */
  bike?: ReactNode;
  /** Something else is the next thing to do (an open workout): the card's own button is then not the primary one. */
  quiet?: boolean;
};
type Advice = ReturnType<typeof useTodayAdvice>;

/**
 * Heute from the week plan: what today is for, with the one thing to do for it. `gym` is the strength plan, shown on a strength day.
 * "Anders heute?" opens "Heute nur … Min" and tomorrow. Without a plan for today it shows nothing; the caller keeps its own view then.
 * With a `port` it also knows the frame: the advice (in spontaneous mode instead of the plan) and "Heute nur".
 */
export function TodayCard(props: Props & { port?: TrackingPort }) {
  return props.port ? <Connected {...props} port={props.port} /> : <View {...props} />;
}

function Connected({ port, ...props }: Props & { port: TrackingPort }) {
  const a = useTodayAdvice(port, props.nowMs);
  return <View {...props} a={a} />;
}

/** The quiet link under the card; it opens the choice for today and tomorrow's line. */
function Other({ a, date, tomorrow }: { a?: Advice; date: string; tomorrow: PlanDay | null }) {
  const [open, setOpen] = useState(false);
  if (!a) return tomorrow ? <p className="muted">Morgen: {label(tomorrow)}</p> : null;
  return (
    <>
      <button type="button" className="link tk-other" aria-expanded={open} onClick={() => setOpen(!open)}>Anders heute? {open ? '⌃' : '›'}</button>
      {open && (
        <>
          <TodayOnly frame={a.frame} date={date} onChange={(m) => void a.setToday(m).catch(() => {})} />
          {tomorrow && <p className="muted">Morgen: {label(tomorrow)}</p>}
        </>
      )}
    </>
  );
}

function View({ weekplans, runs, nowMs, gym, onRun, bike, quiet, a }: Props & { a?: Advice }) {
  const date = dateKeyOf(nowMs);
  const planned = todayPlan(weekplans, nowMs);
  // The advice is the headline whenever it is not the plan day unchanged; the plan day is then one muted line.
  const deviates = a !== undefined && (a.frame.mode === 'spontaneous' || (planned !== null && !a.advice.fromPlan));
  const today: PlanDay | null = a && deviates
    ? { date, sport: a.advice.sport, hardness: a.advice.hardness, fixed: false, ...(a.advice.also ? { also: a.advice.also } : {}) }
    : planned;
  if (a?.advice.done) {
    return (
      <section className="card tk-today-card" aria-label="Heute">
        <h2>Heute erledigt – gut gemacht.</h2>
        <Other a={a} date={date} tomorrow={null} />
      </section>
    );
  }
  if (!today) {
    if (!a) return null;
    return (
      <section className="card tk-today-card" aria-label="Heute">
        <h2>{a.advice.label}</h2>
        <p className="muted">{a.advice.reason}</p>
        <Other a={a} date={date} tomorrow={null} />
      </section>
    );
  }
  const spontaneous = a?.frame.mode === 'spontaneous';
  const tomorrow = spontaneous ? null : planFor(weekplans ?? [], addDays(today.date, 1));
  const run = hasSport(today, 'run') ? runView(runs ?? [], nowMs).week?.runs.find((r) => r.date === today.date) ?? null : null;
  // A run alone says what it is: "Laufen, 50 Minuten".
  const runAlone = today.sport === 'run' && !today.also && run !== null;
  const title = runAlone ? `Laufen, ${run.minutes} Minuten${run.kind === 'easy' ? '' : `, ${RUN_KIND[run.kind] ?? ''}`}` : deviates && a ? a.advice.label : label(today);
  return (
    <section className="card tk-today-card" aria-label={deviates ? 'Heute' : 'Heute laut Wochenplan'}>
      <h2>{title}</h2>
      {deviates && a && <p className="muted">{a.advice.reason}</p>}
      {deviates && !spontaneous && planned && <p className="muted">Geplant war: {label(planned)}</p>}
      {!deviates && today.note && <p className="muted">{today.note}</p>}
      {hasSport(today, 'gym') && gym}
      {hasSport(today, 'run') && (
        <>
          {!runAlone && <p>{run ? `Lauf: ${run.minutes} Minuten ${RUN_KIND[run.kind] ?? ''}`.trim() : 'Ein Lauf nach Gefühl.'}</p>}
          {onRun && <button type="button" className={quiet ? 'secondary' : undefined} onClick={onRun}>Zum Laufen</button>}
        </>
      )}
      {hasSport(today, 'bike') && (bike ?? <p>Die Radeinheit startest du am Mac.</p>)}
      {hasSport(today, 'mobility') && <p>Heute ist Beweglichkeit dran.</p>}
      {today.sport === 'rest' && <p>Ruhetag. Erholung gehört zum Training.</p>}
      <Other a={a} date={date} tomorrow={tomorrow} />
    </section>
  );
}
