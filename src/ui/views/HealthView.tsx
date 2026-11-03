import { useMemo, useState, type MouseEvent } from 'react';
import type { GarminSyncInfo } from '../../shared/coach-protocol';
import type { GarminHealth, GarminReadiness, HealthPoint } from '../../shared/garmin';
import type { StrengthHealth } from '../../coach/strength';
import { allTraining, type Part, type Source } from '../../coach/all-training';
import type { RideSummary } from '../../coach/metrics';
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

/** One chart per measure: two scales in one would suggest false correlations. */
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
      <div className="trend-plot">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        aria-label={`${measure.title}: von ${comma(Math.min(...known))} bis ${comma(highest)} ${measure.unit}, zuletzt ${comma(known.at(-1)!)}`}>
        {measure.bars
          ? points.map((p, i) => { const v = value(p); return v === null ? null : <rect key={p.date} x={x(i) - barWidth / 2} y={y(v)} width={barWidth} height={HEIGHT - y(v)} rx={2} className="trend-bar" />; })
          : <path d={line} className="trend-line" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} className="trend-cross" />}
      </svg>
      {/* Separate element: the stretched chart would distort a circle into an ellipse. */}
      {!measure.bars && shownValue !== null && <span className="trend-dot" style={{ left: `${(x(shownIndex) / WIDTH) * 100}%`, top: `${(y(shownValue) / HEIGHT) * 100}%` }} />}
      </div>
      <div className="trend-axis muted">
        <span>{dateText(points[0].date)}</span>
        <span>{measure.bars ? `höchstens ${comma(highest)}` : `${comma(Math.min(...known))} bis ${comma(highest)}`}</span>
        <span>{dateText(points.at(-1)!.date)}</span>
      </div>
    </figure>
  );
};

type Props = { data: GarminHealth | null; range: HealthRange; onRange: (r: HealthRange) => void; readiness: GarminReadiness | null | undefined; sync: GarminSyncInfo | null | undefined; onBack?: () => void; strength?: StrengthHealth | null; garmin?: boolean; rides?: RideSummary[] | null };

const kg = (n: number): string => `${n.toLocaleString('de-DE')} kg`;
const dayText = (ms: number): string => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

const SOURCES: { key: Source; label: string }[] = [{ key: 'rad', label: 'Rad' }, { key: 'kraft', label: 'Kraft' }, { key: 'andere', label: 'Andere' }];
const duration = (minutes: number): string => (minutes < 60 ? `${minutes} Min.` : `${comma(Math.round(minutes / 6) / 10)} Std.`);

/** All sources side by side, never merged: only time and number of sessions are added up, no load, watts or kilos. */
const AllTrainingSection = ({ rides, strength, data }: { rides: RideSummary[] | null | undefined; strength: StrengthHealth | null | undefined; data: GarminHealth | null }) => {
  const all = useMemo(() => allTraining({ rides, workouts: strength?.sessions, activities: data?.activities }, Date.now()), [rides, strength, data]);
  if (!all) return null;
  const shown = SOURCES.filter((s) => all.sources.includes(s.key));
  const most = Math.max(1, ...all.weeks.map((w) => w.minutes));
  const total = (key: Source): Part => all.weeks.reduce((a, w) => ({ sessions: a.sessions + w[key].sessions, minutes: a.minutes + w[key].minutes }), { sessions: 0, minutes: 0 });
  return (
    <section className="card all-training">
      <h3>Training insgesamt</h3>
      <p className="muted">Zeit und Einheiten der letzten zwölf Wochen, getrennt nach Herkunft.</p>
      <ul className="all-legend">
        {shown.map((s) => <li key={s.key}><span className={`swatch seg-${s.key}`} aria-hidden="true" /><b>{s.label}</b> {total(s.key).sessions} Einheiten, {duration(total(s.key).minutes)}</li>)}
      </ul>
      <ul className="all-bars" aria-label="Trainingszeit pro Woche, die letzten zwölf Wochen">
        {all.weeks.map((w) => (
          <li key={w.weekStartMs} title={`Woche ab ${dayText(w.weekStartMs)}: ${w.sessions === 0 ? 'nichts' : shown.filter((s) => w[s.key].sessions > 0).map((s) => `${s.label} ${duration(w[s.key].minutes)} (${w[s.key].sessions})`).join(', ')}`}>
            <span className="all-plot">
              <span className="all-stack" style={{ height: `${(w.minutes / most) * 100}%` }}>
                {shown.filter((s) => w[s.key].minutes > 0).map((s) => <span key={s.key} className={`seg-${s.key}`} style={{ flexGrow: w[s.key].minutes }} />)}
              </span>
            </span>
            <small>{w.sessions === 0 ? '0' : duration(w.minutes)}</small>
            <small className="muted">{dayText(w.weekStartMs)}</small>
          </li>
        ))}
      </ul>
      <ul className="all-recent" aria-label="Letzte Einheiten">
        {all.recent.map((s) => (
          <li key={s.key}>
            <span className="muted">{dayText(s.startMs)}</span>
            <span className={`source source-${s.source}`}>{SOURCES.find((x) => x.key === s.source)!.label}</span>
            <span>{s.source === 'rad' ? (s.title ?? 'Fahrt') : s.source === 'kraft' ? s.title : (SPORTS[s.sport ?? ''] ?? s.title ?? s.sport ?? 'Training')}</span>
            <span className="muted">{duration(s.minutes)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** What was trained, without a comparison to anything else. */
const StrengthSection = ({ strength }: { strength: StrengthHealth }) => {
  const most = Math.max(1, ...strength.weeks.map((w) => w.workouts));
  return (
    <section className="card">
      <h3>Krafttraining</h3>
      {strength.recent.length === 0 ? <p className="muted">Noch keine Einheiten aus Hevy.</p> : (
        <table className="health-table">
          <thead><tr><th>Tag</th><th>Training</th><th>Dauer</th><th>Sätze</th><th>Volumen</th></tr></thead>
          <tbody>{strength.recent.map((w) => <tr key={w.id}><td>{dayText(w.startMs)}</td><td>{w.title}</td><td>{w.minutes} Min.</td><td>{w.sets}</td><td>{kg(w.volumeKg)}</td></tr>)}</tbody>
        </table>
      )}
      <figure className="trend">
        <figcaption><span>Einheiten pro Woche</span></figcaption>
        <ul className="week-bars" aria-label="Einheiten pro Woche, die letzten zwölf Wochen">
          {strength.weeks.map((w) => <li key={w.weekStartMs} title={`Woche ab ${dayText(w.weekStartMs)}: ${w.workouts} Einheiten, ${kg(w.volumeKg)}`}><span className="trend-bar" style={{ height: `${(w.workouts / most) * 100}%` }} /><small>{w.workouts}</small></li>)}
        </ul>
      </figure>
    </section>
  );
};

export const HealthView = ({ data, range, onRange, readiness, sync, onBack, strength, garmin = true, rides }: Props) => {
  const withData = MEASURES.filter((m) => data?.points.some((p) => p[m.key] !== null));
  const without = MEASURES.filter((m) => !withData.includes(m));
  const updated = sync?.lastRunMs ? new Date(sync.lastRunMs).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : null;
  const p = data?.progress;
  return (
    <main>
      <div className="top">
        <h1>Gesundheit</h1>
        {onBack && <div className="row"><button className="ghost" onClick={onBack}>Zurück</button></div>}
      </div>
      <AllTrainingSection rides={rides} strength={strength} data={garmin ? data : null} />
      {!garmin ? (
        <>
          {strength && <StrengthSection strength={strength} />}
          <p className="muted">Keine medizinische Auswertung.</p>
        </>
      ) : <>
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
      {strength && <StrengthSection strength={strength} />}
      </>}
    </main>
  );
};
