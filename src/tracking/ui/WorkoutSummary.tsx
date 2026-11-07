import type { LoggedWorkout } from '../../shared/records';
import type { NextStep } from '../../shared/stats';
import { nextLine, nextOf } from './next-line';

const KEY = 'pandafit-summary-pending';
/** The finished workout whose summary is still showing. Kept on this device, so a reload shows it until "Fertig". */
export const pendingSummary = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setPendingSummary = (id: string | null): void => {
  try { if (id === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, id); } catch { /* private mode: the summary lives until the screen is left */ }
};

const doneSets = (w: LoggedWorkout): number => w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.doneMs != null && s.type !== 'warmup').length, 0);

/** After a saved finish: what was done, and the coach's next step per exercise (or that it is still coming). One button. */
export function WorkoutSummary({ workout: w, next, onDone }: { workout: LoggedWorkout; next: readonly NextStep[]; onDone: () => void }) {
  const mine = next.filter((n) => n.forWorkoutId === w.id || n.atMs === w.startMs);
  const minutes = Math.max(1, Math.round(((w.endMs ?? w.startMs) - w.startMs) / 60000));
  const rows = w.exercises.map((e) => ({ e, n: nextOf(mine, e) })).filter((r) => r.n);
  return (
    <section className="card tk-summary" aria-label="Zusammenfassung">
      <h2>Training gespeichert · ca. {minutes} Min · {doneSets(w)} Sätze</h2>
      {mine.length === 0
        ? <p className="muted">Nächstes Mal: kommt nach der Auswertung</p>
        : rows.map(({ e, n }, i) => <p key={i} className="tk-sub"><b>{e.title}</b> · {nextLine(n!)}</p>)}
      <button type="button" onClick={onDone}>Fertig</button>
    </section>
  );
}
