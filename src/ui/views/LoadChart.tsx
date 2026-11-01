import { useState } from 'react';
import type { LoadPoint } from '../../coach/metrics';

const date = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const n = (v: number) => Math.round(v);

/** One scale for both lines, the dashes keep them apart without color. Form is the distance between them. */
export const LoadChart = ({ points }: { points: LoadPoint[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  const shown = points[hover ?? points.length - 1];
  const max = Math.max(1, ...points.flatMap((p) => [p.fitness, p.fatigue])) * 1.05;
  const x = (i: number) => (i / (points.length - 1)) * 1000;
  const y = (v: number) => 100 - (v / max) * 96;
  const line = (pick: (p: LoadPoint) => number) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join('');
  const form = n(shown.fitness - shown.fatigue);
  return (
    <section className="card" data-testid="load-chart">
      <h3>Trainingsbelastung</h3>
      <p className="chart-readout">{hover === null ? 'Heute' : date(shown.dayMs)}: Fitness <b>{n(shown.fitness)}</b> · Ermüdung <b>{n(shown.fatigue)}</b> · Form <b>{form > 0 ? `+${form}` : form}</b></p>
      <div
        className="line-plot load-plot" role="img" aria-label={`Fitness ${n(shown.fitness)}, Ermüdung ${n(shown.fatigue)}, Form ${form}`}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))))); }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d={line((p) => p.fitness)} /><path className="fatigue" d={line((p) => p.fatigue)} /></svg>
        {hover !== null && <div className="crosshair" style={{ left: `${x(hover) / 10}%` }} />}
      </div>
      <div className="load-legend muted"><span><i className="swatch" />Fitness</span><span><i className="swatch fatigue" />Ermüdung</span></div>
      <p className="muted">Geschätzt aus deinen Fahrten: Fitness ist der Schnitt der letzten rund 6 Wochen, Ermüdung der letzten Woche. Form ist der Abstand, ein Minus nach harten Tagen ist normal.</p>
    </section>
  );
};
