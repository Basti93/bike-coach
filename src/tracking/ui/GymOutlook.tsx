import type { GymOutlook as Outlook } from '../../shared/gym-outlook';

const dayLabel = (date: string | null): string | null =>
  date ? new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : null;

/** The workouts after the next one, as a sketch, and where the training is heading. Nothing without an outlook. */
export function GymOutlook({ outlook }: { outlook: Outlook | null | undefined }) {
  if (!outlook || (outlook.sessions.length === 0 && !outlook.direction)) return null;
  return (
    <section className="tk-outlook">
      <h3>Danach</h3>
      {outlook.direction && <p>{outlook.direction}</p>}
      {outlook.sessions.length > 0 && (
        <ul className="tk-outlook-list">
          {outlook.sessions.map((s, i) => (
            <li key={i}>
              <details>
                <summary>
                  {dayLabel(s.date) && <span className="muted">{dayLabel(s.date)} · </span>}
                  <strong>{s.name}</strong>
                  {s.focus && <span className="muted"> · {s.focus}</span>}
                </summary>
                <ul>{s.exercises.map((e, j) => <li key={j}>{e.title}, {e.sets} {e.sets === 1 ? 'Satz' : 'Sätze'}</li>)}</ul>
              </details>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Eine Skizze: Jedes Training plant der Coach neu, mit dem, was wirklich passiert ist.</p>
    </section>
  );
}
