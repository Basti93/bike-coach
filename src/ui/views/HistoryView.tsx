import { useState } from 'react';
import { rideStats } from '../../coach/stats';
import type { CoachState } from '../../coach/state';
import type { CoachClientMessage, RideDetail } from '../../shared/coach-protocol';

const RATING: Record<string, string> = { easy: 'zu leicht', right: 'genau richtig', hard: 'zu hart' };
const date = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const WeekBars = ({ weeks }: { weeks: { startMs: number; minutes: number }[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(30, ...weeks.map((w) => w.minutes));
  const shown = hover === null ? weeks.at(-1)! : weeks[hover];
  return (
    <div>
      <p className="chart-readout">{hover === null ? 'Diese Woche' : `Woche ab ${date(shown.startMs)}`}: <b>{shown.minutes} Min.</b></p>
      <div className="bars" onMouseLeave={() => setHover(null)} role="img" aria-label={weeks.map((w) => `Woche ab ${date(w.startMs)}: ${w.minutes} Minuten`).join(', ')}>
        {weeks.map((w, i) => (
          <div key={w.startMs} className="bar-slot" onMouseEnter={() => setHover(i)}>
            <div className="bar" style={{ height: `${w.minutes ? Math.max(3, (w.minutes / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="bars-axis muted"><span>vor 11 Wochen</span><span>diese Woche</span></div>
    </div>
  );
};

/** Je Messgröße ein eigenes Diagramm: zwei Skalen in einem würden Zusammenhänge vortäuschen. */
const LineChart = ({ title, unit, points }: { title: string; unit: string; points: { t: number; v: number | null }[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  const known = points.flatMap((p) => (p.v === null ? [] : [p.v]));
  if (!known.length) return <p className="muted">{title}: keine Daten</p>;
  const max = Math.max(...known) * 1.05;
  const end = points.at(-1)!.t || 1;
  const x = (t: number) => (t / end) * 1000;
  const y = (v: number) => 100 - (v / max) * 96;
  let d = '', pen = false;
  for (const p of points) {
    if (p.v === null) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`;
    pen = true;
  }
  const avg = Math.round(known.reduce((a, b) => a + b, 0) / known.length);
  const shown = hover === null ? null : points[hover];
  return (
    <div className="line-chart">
      <p className="chart-readout">{title}: {shown ? <><b>{shown.v ?? '–'} {unit}</b> bei {mmss(shown.t)}</> : <><b>{avg} {unit}</b> im Schnitt</>}</p>
      <div
        className="line-plot" role="img" aria-label={`${title}, im Schnitt ${avg} ${unit}`}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))))); }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none"><path d={d} /></svg>
        {shown && <div className="crosshair" style={{ left: `${x(shown.t) / 10}%` }} />}
      </div>
    </div>
  );
};

type Props = { state: CoachState; detail: RideDetail | null; send: (m: CoachClientMessage) => void; onBack: () => void };

export const HistoryView = ({ state, detail, send, onBack }: Props) => {
  const [open, setOpen] = useState<string | null>(null);
  const stats = rideStats(state.summaries, Date.now());
  const rides = [...state.summaries].sort((a, b) => b.startedAtMs - a.startedAtMs);
  const toggle = (rideId: string) => {
    setOpen(open === rideId ? null : rideId);
    if (open !== rideId) send({ type: 'ride-detail', profileId: state.profileId, rideId });
  };
  return (
    <main>
      <div className="top">
        <h1>Verlauf</h1>
        <button className="ghost" onClick={onBack}>Zurück</button>
      </div>
      <div className="stat-row">
        <div className="tile"><span className="label">Fahrten</span><b>{stats.rides}</b></div>
        <div className="tile"><span className="label">Stunden</span><b>{(stats.minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })}</b></div>
        <div className="tile"><span className="label">Längste Fahrt</span><b>{stats.longestMinutes} Min.</b></div>
        <div className="tile"><span className="label">Beste Minute</span><b>{stats.bestMinuteW === null ? '–' : `${stats.bestMinuteW} W`}</b></div>
      </div>
      <section className="card">
        <h3>Minuten pro Woche</h3>
        <WeekBars weeks={stats.weeks} />
      </section>
      <section className="card">
        <h3>Deine Fahrten</h3>
        {rides.length === 0 && <p className="muted">Noch ganz leer hier. Deine erste Fahrt wartet schon.</p>}
        <ul className="rides">
          {rides.map((r) => (
            <li key={r.rideId}>
              <button className="ride-row" aria-expanded={open === r.rideId} onClick={() => toggle(r.rideId)}>
                <span>{date(r.startedAtMs)}</span>
                <span className="ride-name">{r.sessionName ?? 'Fahrt'}</span>
                <span>{Math.round(r.durationS / 60)} Min.</span>
                <span className="muted">{RATING[state.feedback[r.rideId]] ?? ''}</span>
              </button>
              {open === r.rideId && (
                <div className="ride-detail">
                  <p className="muted">
                    {r.avgHrBpm === null ? '' : `Puls bis ${r.maxHrBpm}. `}
                    {r.intervalsPlanned ? `${r.intervalsDone} von ${r.intervalsPlanned} harten Abschnitten geschafft. ` : ''}
                    {r.status === 'aborted' ? 'Vorzeitig beendet. ' : ''}
                    {r.suspectData ? 'Viele Messfehler, zählt nicht für Bestwerte. ' : ''}
                    Die FIT-Datei für Garmin liegt unter rides/exports.
                  </p>
                  {detail?.rideId === r.rideId ? (
                    <>
                      <LineChart title="Leistung" unit="W" points={detail.points.map((p) => ({ t: p.t, v: p.powerW }))} />
                      <LineChart title="Puls" unit="bpm" points={detail.points.map((p) => ({ t: p.t, v: p.hrBpm }))} />
                    </>
                  ) : <p className="muted">Lädt…</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
