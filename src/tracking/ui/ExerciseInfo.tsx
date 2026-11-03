import type { ReactNode } from 'react';
import { descriptionCredit, type ExerciseDescription } from '../../shared/exercise-descriptions';

/** How to do an exercise, inline. wger texts carry their credit line in small muted text. */
export function ExerciseInfo({ title, description, children }: { title: string; description: ExerciseDescription; children?: ReactNode }) {
  const credit = descriptionCredit(description);
  return (
    <div className="tk-info" role="note" aria-label={`Ausführung ${title}`}>
      <p>{description.text}</p>
      {credit && <small className="muted tk-credit">{credit}</small>}
      {children}
    </div>
  );
}
