import type { Together } from '../../coach/together';

export const TogetherCard = ({ together }: { together: Together }) => {
  const { peak, people, line } = together;
  return (
    <section className="card together">
      <h3>Euer Berg</h3>
      <p className="peak-title">Auf dem Weg zum <b>{peak.name}</b></p>
      <div className="peak-bar" role="img" aria-label={`${peak.done} von ${peak.total} Höhenmetern`}><div style={{ width: `${Math.min(100, (peak.done / peak.total) * 100)}%` }}><span className="fox" aria-hidden="true">🦊</span></div></div>
      <p className="muted">{peak.done} von {peak.total} Höhenmetern. Jede Minute zählt 10 Höhenmeter, für alle gleich. Danach: {peak.next}.</p>
      {line && <p>{line}</p>}
      <table className="people">
        <thead><tr><th /><th>Fahrten</th><th>Minuten</th><th>Serie</th><th>Wörter</th></tr></thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.profileId}><th>{p.name}</th><td>{p.ridesThisWeek}</td><td>{p.minutesThisWeek}</td><td>{p.streakWeeks === 0 ? '–' : `${p.streakWeeks} ${p.streakWeeks === 1 ? 'Woche' : 'Wochen'}`}</td><td>{p.wordsLearned}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
