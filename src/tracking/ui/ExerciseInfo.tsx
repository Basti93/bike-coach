import type { ReactNode } from 'react';
import { descriptionCredit, type ExerciseDescription } from '../../shared/exercise-descriptions';
import type { ExerciseImage } from '../../shared/exercise-images';
import { ruleNumbers } from '../../shared/training-policy';
import { formatDecimal } from '../session';
import { stepLine } from '../steps';
import { imageSrc } from '../media';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * How to do an exercise, inline: the bundled pictures (if any) above the text, then a YouTube search the person opens
 * themselves. wger texts and pictures carry their credit line in small muted text. Without a text it still shows the
 * video link, so every exercise has somewhere to look.
 */
export function ExerciseInfo({ title, description, images = [], video, icon, children }: {
  title: string; description: ExerciseDescription | null; images?: ExerciseImage[]; video: string;
  icon?: ReactNode; children?: ReactNode;
}) {
  const credit = description && descriptionCredit(description);
  return (
    <div className="tk-info" role="note" aria-label={`Ausführung ${title}`}>
      {images.map((img) => (
        <figure key={img.file} className="tk-info-pic">
          <img src={imageSrc(img.file)} alt={`${title}, Ausführung`} loading="lazy" decoding="async" />
          <figcaption className="muted tk-credit">
            Bild: <a href={img.sourceUrl} {...external}>wger.de</a>{img.author === 'wger.de' ? '' : `, ${img.author}`}, {img.licence}
          </figcaption>
        </figure>
      ))}
      {description ? (
        <>
          <p>{description.text}</p>
          {credit && <small className="muted tk-credit">{credit}</small>}
        </>
      ) : (
        <p className="tk-info-empty">{icon}<span className="muted">Noch keine Beschreibung.</span></p>
      )}
      <a className="tk-video" href={video} {...external}>Video ansehen</a>
      {children}
    </div>
  );
}

const LEARNED = '';

/** One light line with the weight step here and a small select: "gelernt" or one of the offered steps. */
export function StepLine({ title, step, onChoose }: { title: string; step: { stepKg: number; own: boolean }; onChoose: (stepKg: number | null) => void }) {
  return (
    <p className="muted tk-step">
      <span>{stepLine(step)}</span>
      <select aria-label={`Gewichtsstufe ${title}`} value={step.own ? String(step.stepKg) : LEARNED}
        onChange={(e) => onChoose(e.target.value === LEARNED ? null : Number(e.target.value))}>
        <option value={LEARNED}>gelernt</option>
        {[...new Set([...ruleNumbers('load.step-choices'), ...(step.own ? [step.stepKg] : [])])].sort((a, b) => a - b).map((n) => <option key={n} value={String(n)}>{formatDecimal(n)} kg</option>)}
      </select>
    </p>
  );
}
