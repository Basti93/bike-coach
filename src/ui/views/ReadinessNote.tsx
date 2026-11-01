import type { GarminReadiness } from '../../shared/garmin';

/** Only a hint: the session stays as it is, the decision is yours. */
export const ReadinessNote = ({ readiness }: { readiness: GarminReadiness | null | undefined }) => {
  if (readiness?.level !== 'careful') return null;
  return <p className="notice" role="status">Heute eher locker? {readiness.reasons.join('. ')}. Das ist ein Hinweis aus deiner Uhr, keine medizinische Auswertung.</p>;
};
