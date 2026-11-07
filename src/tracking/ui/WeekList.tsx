import { dayLabel, WEEKDAY_LABEL, type PlanDay } from '../../shared/week-plan';
import type { PlannedRun } from '../../shared/run';

export const dayName = (date: string) => WEEKDAY_LABEL[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]!;
const dayText = (d: PlanDay) => dayLabel(d, (p, first) => `${first && d.long ? ', lang' : ''}${p.sport === 'gym' && d.legs ? ', mit Beinen' : ''}`);
const RUN_KIND: Record<string, string> = { easy: 'locker', long: 'lang', test: 'Test' };
export const runText = (r: PlannedRun & { done?: unknown }) => `Laufen, ${r.minutes} Min. ${RUN_KIND[r.kind] ?? ''}${r.hrCap !== null ? ` · Puls bis ${r.hrCap}` : ''}${r.done != null ? ' · gelaufen' : ''}`;

/** Seven day rows, Mo–So: sport and hardness on one line, today marked. The run coach's runs sit on their days. */
export function Week({ days, label, today, runs = [] }: { days: PlanDay[]; label: string; today?: string; runs?: PlannedRun[] }) {
  return (
    <ul className="tk-week" aria-label={label}>
      {days.map((d) => (
        <li key={d.date} className={d.date === today ? 'tk-today' : undefined} aria-current={d.date === today ? 'date' : undefined}>
          <b>{dayName(d.date)}</b> <span>{d.sport === 'run' && runs.some((r) => r.date === d.date) ? runs.filter((r) => r.date === d.date).map(runText).join(' · ') : dayText(d)}</span>
          {d.fixed && <span className="muted"> · fest</span>}{d.note && <span className="muted"> · {d.note}</span>}
          {d.sport !== 'run' && runs.filter((r) => r.date === d.date).map((r) => <span key={r.kind} className="tk-sub"> · {runText(r)}</span>)}
        </li>
      ))}
    </ul>
  );
}
