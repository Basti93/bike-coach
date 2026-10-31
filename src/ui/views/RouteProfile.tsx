import type { Session, Step } from '../../shared/session';

/** Annahme nur für die Zeichnung: Am Berg wird man langsamer, bergab schneller. Die Fahrt selbst läuft nach Zeit. */
const speedMs = (grade: number): number => (grade > 0 ? 8.3 / (1 + 0.2 * grade) : Math.min(14, 8.3 * (1 - 0.4 * grade)));
const gradeOf = (s: Step): number => (s.kind === 'grade' ? s.gradePct : 0);
const color = (g: number): string => {
  if (g < -0.2) return 'var(--down)';
  if (g < 1) return 'var(--flat)';
  if (g < 3) return 'var(--z2)';
  if (g < 5) return 'var(--z3)';
  if (g < 8) return 'var(--z4)';
  return 'var(--z5)';
};
const SAMPLES = 400;
const SMOOTH = 10;

export const hasRoute = (session: Session): boolean => session.steps.some((s) => s.kind === 'grade');

/** Höhe in Metern über die Zeit, an den Übergängen leicht geglättet, damit es wie eine Strecke aussieht. */
const elevation = (session: Session, total: number): number[] => {
  const raw: number[] = [];
  let h = 0, i = 0, stepEnd = session.steps[0].durationS;
  for (let n = 0; n <= SAMPLES; n++) {
    raw.push(h);
    const t = (n / SAMPLES) * total;
    while (t >= stepEnd && i < session.steps.length - 1) stepEnd += session.steps[++i].durationS;
    const g = gradeOf(session.steps[i]);
    h += (total / SAMPLES) * speedMs(g) * (g / 100);
  }
  return raw.map((_, n) => {
    const from = Math.max(0, n - SMOOTH), to = Math.min(SAMPLES, n + SMOOTH);
    return raw.slice(from, to + 1).reduce((a, b) => a + b, 0) / (to - from + 1);
  });
};

/** Höhenprofil: Breite ist die Dauer, die Kurve zeigt, wann es hoch und wann es runter geht. */
export const RouteProfile = ({ session, elapsedS }: { session: Session; elapsedS?: number }) => {
  const total = session.steps.reduce((a, s) => a + s.durationS, 0);
  const hs = elevation(session, total);
  const low = Math.min(...hs);
  const range = Math.max(30, Math.max(...hs) - low);
  const x = (n: number) => (n / SAMPLES) * 1000;
  const y = (n: number) => 96 - ((hs[n] - low) / range) * 66;
  let startS = 0;
  const parts = session.steps.map((s) => {
    const from = Math.round((startS / total) * SAMPLES);
    const leftPct = (startS / total) * 100;
    startS += s.durationS;
    const to = Math.round((startS / total) * SAMPLES);
    let d = `M${x(from)} 100`;
    for (let n = from; n <= to; n++) d += `L${x(n)} ${y(n).toFixed(1)}`;
    return { s, d: `${d}L${x(to)} 100Z`, leftPct, widthPct: (s.durationS / total) * 100 };
  });
  const climb = Math.round(session.steps.reduce((a, s) => a + Math.max(0, s.durationS * speedMs(gradeOf(s)) * (gradeOf(s) / 100)), 0));
  return (
    <div className="route" aria-hidden="true">
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
        {parts.map((p, i) => <path key={i} d={p.d} fill={color(gradeOf(p.s))} />)}
        <path className="route-line" d={hs.map((_, n) => `${n ? 'L' : 'M'}${x(n)} ${y(n).toFixed(1)}`).join('')} />
      </svg>
      {parts.filter((p) => p.s.kind === 'grade' && p.widthPct >= 8).map((p, i) => (
        <div key={i} className="route-label" style={{ left: `${p.leftPct}%`, width: `${p.widthPct}%` }}>
          {gradeOf(p.s) > 0 ? '+' : ''}{gradeOf(p.s).toLocaleString('de-DE')} %
        </div>
      ))}
      <div className="route-climb">ca. {climb} Höhenmeter</div>
      {elapsedS !== undefined && <div className="workout-now" style={{ left: `${Math.min(100, (elapsedS / total) * 100)}%` }} />}
    </div>
  );
};
