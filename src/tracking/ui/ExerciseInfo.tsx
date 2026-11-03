import type { ReactNode } from 'react';
import { descriptionCredit, type ExerciseDescription } from '../../shared/exercise-descriptions';
import type { ExerciseImage } from '../../shared/exercise-images';
import { imageSrc } from '../media';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * How to do an exercise, inline: the bundled pictures (if any) above the text, then a YouTube search the person opens
 * themselves. wger texts and pictures carry their credit line in small muted text. Without a text it still shows the
 * video link, so every exercise has somewhere to look.
 */
export function ExerciseInfo({ title, description, via = null, images = [], video, icon, children }: {
  title: string; description: ExerciseDescription | null; via?: string | null; images?: ExerciseImage[]; video: string;
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
          {via && <p className="muted tk-sub">Beschrieben am Beispiel „{via}“, die Bewegung ist dieselbe.</p>}
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
