import type { Together } from '../../coach/together';
import { TogetherCard } from './TogetherCard';

const date = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

/** The shared overview: only time and regularity, no watts. */
export const TogetherView = ({ together, onBack }: { together: Together; onBack: () => void }) => {
  const max = Math.max(30, ...together.people.flatMap((p) => p.weeks));
  return (
    <main>
      <div className="top">
        <h1>Zusammen</h1>
        <button className="ghost" onClick={onBack}>Zurück</button>
      </div>
      <TogetherCard together={together} />
      {together.summits.length > 0 && (
        <section className="card" data-testid="summits">
          <h3>Euer Gipfelbuch</h3>
          <ul className="rides">
            {[...together.summits].reverse().map((s) => (
              <li key={s.name} className="summit"><b>{s.name}</b><span>gemeinsam erreicht am {new Date(s.atMs).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</span></li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h3>Die letzten 12 Wochen</h3>
        <table className="rhythm">
          <tbody>
            {together.people.map((p) => (
              <tr key={p.profileId}>
                <th>{p.name}</th>
                {p.weeks.map((m, i) => (
                  <td key={i} title={`${m} Minuten, ${i === p.weeks.length - 1 ? 'diese Woche' : `vor ${p.weeks.length - 1 - i} Wochen`}`}>
                    <div className="cell" style={m ? { background: 'var(--z2)', opacity: 0.25 + 0.75 * (m / max) } : undefined} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Je kräftiger, desto mehr Minuten in der Woche. Rechts ist die aktuelle Woche.</p>
      </section>
      <section className="card">
        <h3>Zuletzt gefahren</h3>
        {together.recent.length === 0 && <p className="muted">Noch keine Fahrt. Wer fängt an? 🍁</p>}
        <ul className="rides">
          {together.recent.map((r, i) => (
            <li key={i} className="recent"><span>{date(r.startedAtMs)}</span><b>{r.name}</b><span>{r.sessionName ?? 'Fahrt'}</span><span>{r.minutes} Min.</span></li>
          ))}
        </ul>
      </section>
    </main>
  );
};
