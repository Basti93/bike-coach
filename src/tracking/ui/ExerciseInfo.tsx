import type { ReactNode } from 'react';
import { descriptionCredit, type ExerciseDescription } from '../../shared/exercise-descriptions';

/** How to do an exercise, inline. wger texts carry their credit line in small muted text. */
export function ExerciseInfo({ title, description, via = null, children }: { title: string; description: ExerciseDescription; via?: string | null; children?: ReactNode }) {
  const credit = descriptionCredit(description);
  return (
    <div className="tk-info" role="note" aria-label={`Ausführung ${title}`}>
      {via && <p className="muted tk-sub">Beschrieben am Beispiel „{via}“, die Bewegung ist dieselbe.</p>}
      <p>{description.text}</p>
      {credit && <small className="muted tk-credit">{credit}</small>}
      {children}
    </div>
  );
}
