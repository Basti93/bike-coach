import { useMemo } from 'react';
import { MUSCLE_TARGETS, PAIRS, type MuscleGroup } from '../../shared/muscle-targets';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';
import { readStats, SPORTS, STATS_ID, type Sport, type StatsBody } from '../../shared/stats';
import type { TrackingPort } from '../ports';
import { statsView, type StatsView, type WeekStats } from '../stats';
import { finishedWorkouts, usePortRecords } from './hooks';
import { dateLabel } from './labels';
import { MuscleIcon } from './MuscleIcon';

const SPORT_LABEL: Record<Sport, string> = { bike: 'Rad', strength: 'Kraft', run: 'Laufen', mobility: 'Mobility', other: 'Andere' };
const GROUPS = Object.keys(MUSCLE_TARGETS) as MuscleGroup[];
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const weekTotal = (w: WeekStats) => SPORTS.reduce((a, s) => a + w.minutes[s], 0);
const minutesText = (n: number) => `${Math.round(n)} Minuten`;

const statsOf = (records: TrackedRecord[] | null): StatsBody | null => {
  const r = (records ?? []).find((x) => x.id === STATS_ID && !x.deleted);
  return r ? readStats(r.body) : null;
};

/** The statistics page exists once there is a stats record or at least one finished workout. */
export const statsVisible = (stats: TrackedRecord[] | null, workouts: TrackedRecord[] | null): boolean =>
  statsOf(stats) !== null || finishedWorkouts((workouts ?? []).filter((r) => !r.deleted)).length > 0;

function ThisWeek({ v, hasStats, muscles }: { v: StatsView; hasStats: boolean; muscles: boolean }) {
  const w = v.thisWeek;
  const groups = GROUPS.filter((g) => v.targets[g].max > 0 || (w.sets[g] ?? 0) > 0);
  return (
    <section className="card tk-stats" aria-label="Diese Woche">
      <h2>Diese Woche</h2>
      {v.sports.length > 0 && (
        <dl className="tk-pace">
          {v.sports.map((s) => <div key={s}><dt>{SPORT_LABEL[s]}</dt><dd>{minutesText(w.minutes[s])}</dd></div>)}
        </dl>
      )}
      {hasStats && <p>Harte Tage: {w.hardDays}</p>}
      {muscles && (
        <ul className="tk-band-list">
          {groups.map((g) => {
            const n = w.sets[g] ?? 0;
            const { min, max } = v.targets[g];
            const scale = Math.max(max * 1.25, n, 1);
            return (
              <li key={g}>
                <MuscleIcon group={g} />
                <span className="tk-band-label">{MUSCLE_TARGETS[g].label}</span>
                <span className="tk-band" aria-hidden="true">
                  {max > 0 && <span className="tk-band-range" style={{ left: `${(min / scale) * 100}%`, width: `${((max - min) / scale) * 100}%` }} />}
                  <span className="tk-band-value" style={{ width: `${(n / scale) * 100}%` }} />
                </span>
                <span className="tk-band-text">{max > 0 ? `${n} von ${min}–${max} Sätzen` : `${n} Sätze`}</span>
              </li>
            );
          })}
        </ul>
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
          const label = `Woche vom ${shortDate(w.weekStart)}: ${minutesText(total)}`;
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

function SetsTable({ weeks }: { weeks: WeekStats[] }) {
  const groups = GROUPS.filter((g) => weeks.some((w) => (w.sets[g] ?? 0) > 0));
  if (groups.length === 0) return <p className="muted">In diesen Wochen noch keine Sätze.</p>;
  return (
    <div className="tk-table-wrap">
      <table className="tk-sets-table">
        <caption>Sätze pro Woche</caption>
        <thead><tr><th scope="col">Muskel</th>{weeks.map((w) => <th key={w.weekStart} scope="col">{shortDate(w.weekStart)}</th>)}</tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g}><th scope="row">{MUSCLE_TARGETS[g].label}</th>{weeks.map((w) => <td key={w.weekStart}>{w.sets[g] ?? 0}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Minutes, hard days and sets per muscle: what the week was and how the last eight looked. No score, no streak. */
export function StatsScreen({ port, now }: { port: TrackingPort; now: () => number }) {
  const statsRecords = usePortRecords(port, 'stats').records;
  const workoutRecords = usePortRecords(port, 'workout').records;
  const stats = useMemo(() => statsOf(statsRecords), [statsRecords]);
  const workouts: LoggedWorkout[] = useMemo(() => finishedWorkouts(workoutRecords), [workoutRecords]);
  const nowMs = now();
  const v = useMemo(() => statsView(stats, workouts, nowMs), [stats, workouts, nowMs]);
  if (statsRecords === null || workoutRecords === null) return <div className="tk-screen" aria-busy="true" />;

  const hasStats = stats !== null;
  const muscles = workouts.length > 0;
  const weeks = v.weeks.slice(0, v.weeks.length - 1);
  const minutes = v.sports.length > 0;
  return (
    <div className="tk-screen">
      <div>
        <h1 className="tk-title">Statistik</h1>
        <p className="muted">{v.asOfMs !== null ? `Stand: ${dateLabel(v.asOfMs)}` : 'Minuten und harte Tage erscheinen nach dem nächsten Lauf des Coaches.'}</p>
      </div>
      <ThisWeek v={v} hasStats={hasStats} muscles={muscles} />
      {(minutes || muscles) && (
        <section className="card tk-stats" aria-label="Letzte 8 Wochen">
          <h2>Letzte 8 Wochen</h2>
          {minutes && <MinutesChart v={v} weeks={weeks} hasStats={hasStats} />}
          {muscles && (
            <>
              <SetsTable weeks={weeks} />
              <h3>Verhältnis der letzten 4 Wochen</h3>
              <ul className="tk-pairs">
                {v.pairs.map((p, i) => <li key={p.label}>{`${MUSCLE_TARGETS[PAIRS[i].a].label} ${p.a} : ${p.b} ${MUSCLE_TARGETS[PAIRS[i].b].label}`}</li>)}
              </ul>
            </>
          )}
        </section>
      )}
      {v.unknown.length > 0 && <p className="muted">Ohne bekannten Muskel: {v.unknown.join(', ')}</p>}
    </div>
  );
}
