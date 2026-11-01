import { useState, type MouseEvent } from 'react';
import type { GarminSyncInfo } from '../../shared/coach-protocol';
import type { GarminHealth, GarminReadiness, HealthPoint } from '../../shared/garmin';
import { ReadinessNote } from './ReadinessNote';

export type HealthRange = number | null;
const RANGES: { label: string; days: HealthRange }[] = [
  { label: '7 Tage', days: 7 }, { label: '28 Tage', days: 28 }, { label: '90 Tage', days: 90 }, { label: '1 Jahr', days: 365 }, { label: 'Gesamt', days: null },
];
const SPORTS: Record<string, string> = {
  cycling: 'Radfahren', road_biking: 'Rennrad', virtual_ride: 'Virtuelle Fahrt', indoor_cycling: 'Indoor-Rad', running: 'Laufen', treadmill_running: 'Laufband',
  hiking: 'Wandern', walking: 'Gehen', swimming: 'Schwimmen', lap_swimming: 'Schwimmen', rowing_v2: 'Rudern', wakeboarding_v2: 'Wakeboard', strength_training: 'Kraft',
};
const comma = (n: number): string => String(n).replace('.', ',');
const dateText = (date: string): string => new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });

type Measure = { key: Exclude<keyof HealthPoint, 'date'>; title: string; unit: string; bars?: boolean; scale?: number };
const MEASURES: Measure[] = [
  { key: 'restingHrBpm', title: 'Ruhepuls', unit: 'bpm' },
  { key: 'load', title: 'Belastung', unit: 'Punkte', bars: true },
  { key: 'vo2max', title: 'VO2max', unit: 'ml/kg/min' },
  { key: 'stressAvg', title: 'Stress', unit: 'von 100' },
  { key: 'bodyBatteryMax', title: 'Body Battery', unit: 'von 100' },
  { key: 'sleepS', title: 'Schlaf', unit: 'Stunden', scale: 1 / 3600 },
  { key: 'hrvMs', title: 'HRV', unit: 'ms' },
];

const WIDTH = 1000;
const HEIGHT = 120;

/** Je Messgröße ein eigenes Diagramm: Zwei Skalen in einem würden Zusammenhänge vortäuschen. */
const Trend = ({ measure, points }: { measure: Measure; points: HealthPoint[] }) => {
  const [hover, setHover] = useState<number | null>(null);
  const value = (p: HealthPoint): number | null => {
    const v = p[measure.key];
    return v === null ? null : Math.round(v * (measure.scale ?? 1) * 10) / 10;
  };
  const known = points.flatMap((p) => { const v = value(p); return v === null ? [] : [v]; });
  const lowest = measure.bars ? 0 : Math.min(...known);
  const highest = Math.max(...known);
  const pad = (highest - lowest || 1) * 0.1;
  const x = (i: number): number => (points.length > 1 ? (i / (points.length - 1)) * WIDTH : WIDTH / 2);
  const y = (v: number): number => HEIGHT - ((v - (measure.bars ? 0 : lowest - pad)) / (highest + pad - (measure.bars ? 0 : lowest - pad))) * HEIGHT;
  let line = '';
  let pen = false;
  points.forEach((p, i) => {
    const v = value(p);
    if (v === null) { pen = false; return; }
    line += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  const lastIndex = points.reduce((found, p, i) => (value(p) !== null ? i : found), -1);
  const shownIndex = hover ?? lastIndex;
  const shown = points[shownIndex];
  const shownValue = shown ? value(shown) : null;
  const onMove = (e: MouseEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - box.left) / box.width) * (points.length - 1)))));
  };
  const barWidth = Math.max(2, (WIDTH / points.length) * 0.6);
  return (
    <figure className="trend">
      <figcaption>
        <span>{measure.title}</span>
        <span className="muted">{shown && dateText(shown.date)}: <b>{shownValue === null ? '–' : comma(shownValue)}</b> {measure.unit}</span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        aria-label={`${measure.title}: von ${comma(Math.min(...known))} bis ${comma(highest)} ${measure.unit}, zuletzt ${comma(known.at(-1)!)}`}>
        {measure.bars
          ? points.map((p, i) => { const v = value(p); return v === null ? null : <rect key={p.date} x={x(i) - barWidth / 2} y={y(v)} width={barWidth} height={HEIGHT - y(v)} rx={2} className="trend-bar" />; })
          : <path d={line} className="trend-line" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} className="trend-cross" />}
        {!measure.bars && shownValue !== null && <circle cx={x(shownIndex)} cy={y(shownValue)} r={4} className="trend-dot" />}
      </svg>
      <div className="trend-axis muted">
        <span>{dateText(points[0].date)}</span>
        <span>{measure.bars ? `höchstens ${comma(highest)}` : `${comma(Math.min(...known))} bis ${comma(highest)}`}</span>
        <span>{dateText(points.at(-1)!.date)}</span>
      </div>
    </figure>
  );
};

type Props = { data: GarminHealth | null; range: HealthRange; onRange: (r: HealthRange) => void; readiness: GarminReadiness | null | undefined; sync: GarminSyncInfo | null | undefined; onBack: () => void };

export const HealthView = ({ data, range, onRange, readiness, sync, onBack }: Props) => {
  const withData = MEASURES.filter((m) => data?.points.some((p) => p[m.key] !== null));
  const without = MEASURES.filter((m) => !withData.includes(m));
  const updated = sync?.lastRunMs ? new Date(sync.lastRunMs).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const p = data?.progress;
  return (
    <main>
      <div className="top">
        <h1>Gesundheit</h1>
        <div className="row"><button className="ghost" onClick={onBack}>Zurück</button></div>
      </div>
      {sync?.problem === 'reauth' && <p className="notice" role="alert">Die Garmin-Anmeldung ist abgelaufen. Bitte auf der Startseite erneut anmelden.</p>}
      <ReadinessNote readiness={readiness} />
      <div className="row health-ranges">
        {RANGES.map((r) => <button key={r.label} className={r.days === range ? '' : 'secondary'} aria-pressed={r.days === range} onClick={() => onRange(r.days)}>{r.label}</button>)}
      </div>
      {!data && <p className="muted" role="status">Seite lädt…</p>}
      {data && !withData.length && <p className="muted">Noch keine Daten für diesen Zeitraum. Der Verlauf lädt im Hintergrund.</p>}
      <div className="health-grid">{withData.map((m) => <Trend key={m.key} measure={m} points={data!.points} />)}</div>
      {data && withData.length > 0 && without.length > 0 && <p className="muted">Keine Daten von deiner Uhr: {without.map((m) => m.title).join(', ')}.</p>}
      {data?.pulseBeforeRides && (
        <p className="notice">Aus {data.pulseBeforeRides.rides} bewerteten Fahrten: Vor Fahrten, die sich zu hart anfühlten, lag dein Ruhepuls im Schnitt bei {comma(data.pulseBeforeRides.hard)} bpm, sonst bei {comma(data.pulseBeforeRides.other)} bpm.</p>
      )}
      {data && data.years.length > 0 && (
        <section className="card">
          <h3>Aktivitäten je Jahr</h3>
          <table className="health-table">
            <thead><tr><th>Jahr</th><th>Sportart</th><th>Anzahl</th><th>Stunden</th></tr></thead>
            <tbody>{data.years.map((y) => <tr key={`${y.jahr}-${y.sport}`}><td>{y.jahr}</td><td>{SPORTS[y.sport] ?? y.sport}</td><td>{y.anzahl}</td><td>{comma(y.stunden)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <p className="muted">
        {updated && `Zuletzt aktualisiert: ${updated}. `}
        {p && !sync?.complete && `Verlauf lädt noch: ${p.activities} Aktivitäten, ${p.daysDone} von ${p.daysTotal} Tagen, ${p.filesDone} von ${p.filesTotal} Dateien. `}
        Trends aus deiner Uhr, keine medizinische Auswertung.
      </p>
    </main>
  );
};
