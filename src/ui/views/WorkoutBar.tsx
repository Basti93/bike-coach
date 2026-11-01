import { stepFtpFraction, type Session } from '../../shared/session';
import { hasRoute, RouteProfile } from './RouteProfile';

const zone = (i: number): string => {
  if (i < 0.56) return 'var(--z1)';
  if (i < 0.76) return 'var(--z2)';
  if (i < 0.91) return 'var(--z3)';
  if (i < 1.06) return 'var(--z4)';
  return 'var(--z5)';
};

/** Breite ist Dauer, Höhe und Farbe sind die Belastung. Bei Steigungen liegt das Höhenprofil dezent dahinter. */
export const WorkoutBar = ({ session, elapsedS, currentW }: { session: Session; elapsedS?: number; currentW?: number | null }) => {
  const total = session.steps.reduce((a, s) => a + s.durationS, 0);
  const max = Math.max(1.1, ...session.steps.map(stepFtpFraction));
  let start = 0;
  let centerPct: number | null = null;
  let grade: number | null = null;
  for (const s of session.steps) {
    if (elapsedS !== undefined && centerPct === null && elapsedS < start + s.durationS) {
      centerPct = ((start + s.durationS / 2) / total) * 100;
      grade = s.kind === 'grade' ? s.gradePct : null;
    }
    start += s.durationS;
  }
  return (
    <div className={hasRoute(session) ? 'workout with-route' : 'workout'} aria-hidden="true">
      {hasRoute(session) && <RouteProfile session={session} />}
      {session.steps.map((s, i) => (
        <div key={i} className="workout-step" style={{ flexGrow: s.durationS, height: `${Math.max(12, (stepFtpFraction(s) / max) * 100)}%`, background: zone(stepFtpFraction(s)) }} />
      ))}
      {currentW != null && centerPct !== null && <div className="workout-label" style={{ left: `${centerPct}%` }}>{currentW} W{grade === null ? '' : ` · ${grade.toLocaleString('de-DE')} %`}</div>}
      {elapsedS !== undefined && <div className="workout-now" style={{ left: `${Math.min(100, (elapsedS / total) * 100)}%` }} />}
    </div>
  );
};
