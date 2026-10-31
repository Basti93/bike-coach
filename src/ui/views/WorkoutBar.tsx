import type { Session, Step } from '../../shared/session';

const intensity = (s: Step): number => (s.kind === 'erg' ? s.ftpFraction : 0.55 + Math.max(0, s.gradePct) * 0.06);
const zone = (i: number): string => {
  if (i < 0.56) return 'var(--z1)';
  if (i < 0.76) return 'var(--z2)';
  if (i < 0.91) return 'var(--z3)';
  if (i < 1.06) return 'var(--z4)';
  return 'var(--z5)';
};

/** Das Profil der Einheit: Breite ist Dauer, Höhe und Farbe sind die Belastung. */
export const WorkoutBar = ({ session, elapsedS }: { session: Session; elapsedS?: number }) => {
  const total = session.steps.reduce((a, s) => a + s.durationS, 0);
  const max = Math.max(1.1, ...session.steps.map(intensity));
  return (
    <div className="workout" aria-hidden="true">
      {session.steps.map((s, i) => (
        <div key={i} className="workout-step" style={{ flexGrow: s.durationS, height: `${Math.max(12, (intensity(s) / max) * 100)}%`, background: zone(intensity(s)) }} />
      ))}
      {elapsedS !== undefined && <div className="workout-now" style={{ left: `${Math.min(100, (elapsedS / total) * 100)}%` }} />}
    </div>
  );
};
