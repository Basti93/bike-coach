import type { TrackingPort } from '../ports';
import { kmText } from '../../shared/run';
import { weekRangeText } from '../../shared/meals';
import { usePortRecords } from './hooks';
import { kmFromKm, runView } from './run-view';

/** The weekly look back. Nothing without review records. */
export function RunLookBack({ port, now }: { port: TrackingPort; now: () => number }) {
  const q = usePortRecords(port, 'run');
  const { reviews } = runView(q.records ?? [], now());
  if (reviews.length === 0) return null;
  return (
    <div className="tk-screen">
      <section className="card">
        <h2>Wochenrückblick</h2>
        <ul className="tk-list tk-run-list">
          {reviews.slice(0, 6).map((r) => (
            <li key={r.week}>
              <b>{weekRangeText(r.week)}</b>
              <span>{kmFromKm(r.km)} in {r.minutes} Min.{r.plannedMinutes !== null ? `, geplant waren ${r.plannedMinutes} Min.` : ''}</span>
              {r.longestKm !== null && <span>Längster Lauf: {kmFromKm(r.longestKm)}</span>}
              {r.testM !== null && <span>Test über 30 Minuten: {kmText(r.testM)}</span>}
              <span className="muted">{r.focus}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
