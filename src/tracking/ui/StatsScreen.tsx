import { useMemo, useState } from 'react';
import { STATE_LABELS, type GroupBalance } from '../../shared/muscle-balance';
import { MUSCLE_TARGETS, type MuscleGroup } from '../../shared/muscle-targets';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';
import { readStats, SPORTS, STATS_ID, type Sport, type StatsBody } from '../../shared/stats';
import type { TrackingPort } from '../ports';
import { statsView, wellFormed, type StatsView, type WeekStats } from '../stats';
import { finishedWorkouts, useCatalog, useGoal, usePortRecords } from './hooks';
import { dateLabel } from './labels';
import { MuscleIcon } from './MuscleIcon';
import { progressRows, type ProgressRow } from '../progress';
import { runView } from './run-view';

const SPORT_LABEL: Record<Sport, string> = { bike: 'Rad', strength: 'Kraft', run: 'Laufen', mobility: 'Mobility', other: 'Andere' };
const GROUPS = Object.keys(MUSCLE_TARGETS) as MuscleGroup[];
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const weekTotal = (w: WeekStats) => SPORTS.reduce((a, s) => a + w.minutes[s], 0);
const minutesText = (n: number) => `${Math.round(n)} Minuten`;
const daysText = (w: WeekStats, sep: string) => [`Locker ${w.days.easy}`, `Mittel ${w.days.moderate}`, `Hart ${w.days.hard}`, `Ruhetage ${w.days.rest}`].join(sep);
/** Finished workouts the page can count; a broken body is skipped. */
const countable = (records: TrackedRecord[] | null): LoggedWorkout[] => wellFormed(finishedWorkouts(records));

const statsOf = (records: TrackedRecord[] | null): StatsBody | null => {
  const r = (records ?? []).find((x) => x.id === STATS_ID && !x.deleted);
  return r ? readStats(r.body) : null;
};

/** The statistics page exists once there is a stats record or at least one finished workout. */
export const statsVisible = (stats: TrackedRecord[] | null, workouts: TrackedRecord[] | null): boolean =>
  statsOf(stats) !== null || countable((workouts ?? []).filter((r) => !r.deleted)).length > 0;

const half = (n: number) => String(Math.round(n * 2) / 2).replace('.', ',');
const satz = (n: number) => `${n} ${n === 1 ? 'Satz' : 'Sätze'}`;

/** The numbers behind a state, in words: this week's direct and indirect sets and the target. */
function detailText(b: GroupBalance): string {
  const parts = [`${satz(b.direct7)} direkt`];
  if (b.indirect7 > 0) parts.push(`${satz(b.indirect7)} mittrainiert (${b.indirect7 === 1 ? 'zählt' : 'zählen'} halb)`);
  const week = `Diese Woche: ${parts.join(', ')}.`;
  return b.target.max > 0 ? `${week} Ziel: ${b.target.min}–${b.target.max} pro Woche.` : week;
}

function MuscleRow({ b }: { b: GroupBalance }) {
  const [open, setOpen] = useState(false);
  const state = b.state ?? 'none';
  const panel = `tk-muscle-${b.group}`;
  return (
    <li>
      <button type="button" className="tk-muscle-row" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <MuscleIcon group={b.group} />
        <span className="tk-muscle-name">
          {b.label}
          {b.indirect7 > b.direct7 && <small className="muted">vor allem mittrainiert</small>}
        </span>
        {b.state !== null && (
          <span className={`tk-state tk-state-${state}`}><span className="tk-state-dot" aria-hidden="true" />{STATE_LABELS[state]}</span>
        )}
      </button>
      {open && <p id={panel} className="muted tk-small tk-muscle-detail">{detailText(b)}</p>}
    </li>
  );
}

function ThisWeek({ v, hasStats, muscles }: { v: StatsView; hasStats: boolean; muscles: boolean }) {
  const w = v.thisWeek;
  const [all, setAll] = useState(false);
  const allRows = v.balance.filter((b) => b.state !== null || b.direct7 + b.indirect7 > 0);
  // A new person is not told everything is missing: groups below target show once something was trained in the last 4 weeks.
  const active = v.balance.some((b) => b.effective28 > 0);
  const shown = allRows.filter((b) => b.direct7 + b.indirect7 > 0);
  // Untrained groups are one line, not rows, so the list stays short.
  const untrained = active && !all ? allRows.filter((b) => b.state === 'none') : [];
  const rows = all ? allRows : shown;
  return (
    <section className="card tk-stats" aria-label="Diese Woche">
      <h2>Diese Woche</h2>
      {v.sports.length > 0 && (
        <dl className="tk-pace">
          {v.sports.map((s) => <div key={s}><dt>{SPORT_LABEL[s]}</dt><dd>{minutesText(w.minutes[s])}</dd></div>)}
        </dl>
      )}
      {hasStats && <p>{daysText(w, ' · ')}</p>}
      {muscles && <ul className="tk-muscle-list">{rows.map((b) => <MuscleRow key={b.group} b={b} />)}</ul>}
      {muscles && untrained.length > 0 && <p className="muted tk-small">{`${STATE_LABELS.none}: ${untrained.map((b) => b.label).join(', ')}`}</p>}
      {muscles && shown.length === 0 && untrained.length === 0 && !all && <p className="muted">Diese Woche noch keine Sätze.</p>}
      {muscles && allRows.length > shown.length && (
        <button type="button" className="ghost" onClick={() => setAll(!all)}>{all ? 'Weniger Muskelgruppen' : 'Alle Muskelgruppen anzeigen'}</button>
      )}
      {v.verdicts.length > 0 && <ul className="tk-verdicts">{v.verdicts.map((t) => <li key={t}>{t}</li>)}</ul>}
    </section>
  );
}

function MinutesChart({ v, weeks, hasStats }: { v: StatsView; weeks: WeekStats[]; hasStats: boolean }) {
  const max = Math.max(1, ...weeks.map(weekTotal));
  return (
    <>
      <h3>Minuten pro Woche</h3>
      <ul className="tk-legend">
        {v.sports.map((s) => <li key={s}><span className={`tk-swatch tk-sport-${s}`} aria-hidden="true" />{SPORT_LABEL[s]}</li>)}
      </ul>
      <div className="tk-stack-chart">
        {weeks.map((w) => {
          const total = weekTotal(w);
          const label = `Woche vom ${shortDate(w.weekStart)}: ${minutesText(total)}${hasStats ? `, ${daysText(w, ', ')}` : ''}`;
          const parts = v.sports.filter((s) => w.minutes[s] > 0).map((s) => `${SPORT_LABEL[s]} ${Math.round(w.minutes[s])}`).join(', ');
          return (
            <div key={w.weekStart} className="tk-stack-col">
              <span className="tk-stack-total">{Math.round(total)}</span>
              <div className="tk-stack" role="img" aria-label={label} title={parts ? `${label} (${parts})` : label}>
                {v.sports.filter((s) => w.minutes[s] > 0).map((s) => (
                  <span key={s} className={`tk-sport-${s}`} style={{ height: `${(w.minutes[s] / max) * 100}%` }} />
                ))}
              </div>
              <span className="tk-stack-date">{shortDate(w.weekStart)}</span>
              {hasStats && <span className="tk-stack-hard" title="Harte Tage">{w.hardDays}</span>}
            </div>
          );
        })}
      </div>
      <p className="muted tk-small">Die Zahl über dem Balken sind die Minuten der Woche{hasStats ? ', die Zahl unter dem Datum die harten Tage' : ''}.</p>
    </>
  );
}

function SetsTable({ weeks: all }: { weeks: WeekStats[] }) {
  // Four weeks fit a phone without scrolling sideways.
  const weeks = all.slice(-4);
  const groups = GROUPS.filter((g) => weeks.some((w) => (w.effective[g] ?? 0) > 0));
  if (groups.length === 0) return <p className="muted">In diesen Wochen noch keine Sätze.</p>;
  return (
    <div className="tk-table-wrap">
      <table className="tk-sets-table">
        <caption>Sätze pro Woche (letzte 4 Wochen)</caption>
        <thead><tr><th scope="col">Muskel</th>{weeks.map((w) => <th key={w.weekStart} scope="col">{shortDate(w.weekStart)}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g}><th scope="row">{MUSCLE_TARGETS[g].label}</th>{weeks.map((w) => <td key={w.weekStart}>{half(w.effective[g] ?? 0)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Minutes, hard days and sets per muscle: what the week was and how the last eight looked. No score, no streak. */
/** Progress over the months: one line per area, no charts. */
function Progress({ rows }: { rows: ProgressRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="card tk-stats" aria-label="Fortschritt">
      <h2>Fortschritt</h2>
      <dl className="tk-progress">
        {rows.map((r) => (
          <div key={r.label}><dt>{r.label}</dt><dd>{r.value}{r.change && <span className="muted"> · {r.change}</span>}</dd></div>
        ))}
      </dl>
    </section>
  );
}

export function StatsScreen({ port, now }: { port: TrackingPort; now: () => number }) {
  const statsQ = usePortRecords(port, 'stats');
  const workoutsQ = usePortRecords(port, 'workout');
  const statsRecords = statsQ.records;
  const workoutRecords = workoutsQ.records;
  const runRecords = usePortRecords(port, 'run').records;
  const stats = useMemo(() => statsOf(statsRecords), [statsRecords]);
  const workouts: LoggedWorkout[] = useMemo(() => countable(workoutRecords), [workoutRecords]);
  const nowMs = now();
  const catalog = useCatalog(port);
  const goal = useGoal(port);
  const v = useMemo(() => statsView(stats, workouts, nowMs, catalog, goal.strength), [stats, workouts, nowMs, catalog, goal]);
  const progress = useMemo(() => progressRows({
    nowMs, ftp: stats?.ftp ?? [], weightKg: stats?.weightKg ?? null, runPace: runView(runRecords ?? [], nowMs).status?.numbers.easyPace ?? null,
    workouts, weeks: v.weeks.slice(0, -1).map((w) => ({ sets: w.effective })), targets: v.targets,
  }), [stats, runRecords, workouts, v, nowMs]);
  if (statsQ.failed || workoutsQ.failed) {
    const retry = () => { if (statsQ.failed) statsQ.retry(); if (workoutsQ.failed) workoutsQ.retry(); };
    return (
      <div className="tk-screen">
        <p role="status" className="tk-note">Die Statistik konnte gerade nicht gelesen werden. Es ist nichts verloren, versuch es gleich nochmal.</p>
        <button type="button" onClick={retry}>Nochmal versuchen</button>
      </div>
    );
  }
  if (statsRecords === null || workoutRecords === null) return <div className="tk-screen" aria-busy="true" />;

  const hasStats = stats !== null;
  const muscles = workouts.length > 0;
  const weeks = v.weeks.slice(0, v.weeks.length - 1);
  const minutes = v.sports.length > 0;
  const pairs = v.pairs.map((p, i) => ({ p, i })).filter(({ p }) => p.a > 0 || p.b > 0);
  return (
    <div className="tk-screen">
      <div>
        <h1 className="tk-title">Statistik</h1>
        <p className="muted">{v.asOfMs !== null ? `Stand: ${dateLabel(v.asOfMs)}` : 'Minuten und harte Tage erscheinen nach dem nächsten Lauf des Coaches.'}</p>
      </div>
      <Progress rows={progress} />
      <ThisWeek v={v} hasStats={hasStats} muscles={muscles} />
      {(minutes || muscles) && (
        <section className="card tk-stats" aria-label="Letzte 8 Wochen">
          <h2>Letzte 8 Wochen</h2>
          {minutes && <MinutesChart v={v} weeks={weeks} hasStats={hasStats} />}
          {muscles && (
            <>
              <SetsTable weeks={weeks} />
              {pairs.length > 0 && (
                <>
                  <h3>Verhältnis der letzten 4 Wochen</h3>
                  <ul className="tk-pairs">
                    {pairs.map(({ p, i }) => <li key={p.label}>{`${p.aLabel} ${p.a} : ${p.b} ${p.bLabel}`}</li>)}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      )}
      {v.unknown.length > 0 && <p className="muted">Ohne bekannten Muskel: {v.unknown.join(', ')}</p>}
    </div>
  );
}
