import type { GarminReadiness } from '../../shared/garmin';

/** Nur ein Hinweis: Die Einheit bleibt, wie sie ist, die Entscheidung liegt bei dir. */
export const ReadinessNote = ({ readiness }: { readiness: GarminReadiness | null | undefined }) => {
  if (readiness?.level !== 'careful') return null;
  return <p className="notice" role="status">Heute eher locker? {readiness.reasons.join('. ')}. Das ist ein Hinweis aus deiner Uhr, keine medizinische Auswertung.</p>;
};
