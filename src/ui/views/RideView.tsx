import { useEffect, useState, type ReactNode } from 'react';
import type { ClientMessage, StateMessage } from '../../shared/protocol';
import { WorkoutBar } from './WorkoutBar';

const WARN_BEFORE_S = 15;
const ON_TARGET = 0.05;
const value = (n: number | null | undefined) => (n === null || n === undefined ? '–' : String(Math.round(n)));
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const powerClass = (power: number | null | undefined, target: number | null): string => {
  if (power === null || power === undefined || target === null) return '';
  const off = (power - target) / target;
  if (off < -ON_TARGET) return 'low';
  if (off > ON_TARGET) return 'high';
  return 'good';
};

export const RideView = ({ state, send, compact = false, extra }: { state: StateMessage; send: (m: ClientMessage) => void; compact?: boolean; extra?: ReactNode }) => {
  const [ending, setEnding] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') send({ type: 'shift', dir: 'up' });
      if (e.key === 'ArrowDown') send({ type: 'shift', dir: 'down' });
      if (e.key === 'm') send({ type: 'mark' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const { engine, latest, devices, session } = state;
  if (!engine) return null;
  const isGrade = engine.gradePct !== null;
  const target = isGrade ? engine.gradePct!.toFixed(1).replace('.', ',') : value(engine.targetW);
  const unit = isGrade ? '%' : 'W';
  const warn = engine.nextLabel && engine.secondsToNext <= WARN_BEFORE_S;
  const totalLeft = session ? Math.max(0, session.steps.reduce((a, s) => a + s.durationS, 0) - engine.rideElapsedS) : null;
  const banners = (
    <>
      {state.storageError && <div className="banner danger" role="alert">Speichern schlägt gerade fehl. Die Fahrt läuft weiter, bitte Speicherplatz prüfen.</div>}
      {warn && <div className="banner warn" role="alert">In {engine.secondsToNext} s: {engine.nextLabel}</div>}
      {engine.paused && <div className="banner info" role="status">Pause. Tritt an, dann geht es weiter.</div>}
    </>
  );
  if (compact) {
    return (
      <main className="film">
        {banners}
        <div className="film-main">
          <div><span className="label">Vorgabe</span><b data-testid="target">{target}<small>{unit}</small></b></div>
          <div><span className="label">Leistung</span><b data-testid="power" className={powerClass(latest.powerW, engine.targetW)}>{value(latest.powerW)}</b></div>
        </div>
        <div className="film-side">
          <span>♥ <b data-testid="hr">{value(latest.hrBpm)}</b></span>
          <span>↻ <b>{value(latest.cadenceRpm)}</b></span>
          <span>⏱ <b data-testid="remaining">{mmss(engine.stepRemainingS)}</b></span>
        </div>
      </main>
    );
  }
  return (
    <main className="ride">
      <header className="ride-head">
        <div>
          <h2>{engine.label}</h2>
          {engine.nextLabel && <span className="muted">Danach: {engine.nextLabel}</span>}
        </div>
        <div className="devices">
          <span className={devices.trainer === 'connected' ? 'dot on' : 'dot'}>Trainer</span>
          <span className={devices.hr === 'connected' ? 'dot on' : 'dot'}>Puls</span>
          <span className={devices.clicker === 'connected' ? 'dot on' : 'dot'}>Clicker</span>
        </div>
      </header>
      {banners}
      {devices.trainer !== 'connected' && <div className="banner warn" role="status">Trainer wird gesucht. Die Fahrt läuft weiter und ist gespeichert.</div>}
      {engine.autoReducedPct > 0 && <div className="banner info" role="status">Vorgabe automatisch um {engine.autoReducedPct} % gesenkt.</div>}
      {extra}
      <section className="hero">
        <div className="hero-tile">
          <span className="label">{isGrade ? 'Steigung' : 'Vorgabe'}</span>
          <b data-testid="target">{target}<small>{unit}</small></b>
        </div>
        <div className="hero-tile">
          <span className="label">Leistung</span>
          <b data-testid="power" className={powerClass(latest.powerW, engine.targetW)}>{value(latest.powerW)}<small>W</small></b>
        </div>
      </section>
      <section className="stats">
        <div className="tile"><span className="label">Restzeit Abschnitt</span><b data-testid="remaining">{mmss(engine.stepRemainingS)}</b></div>
        <div className="tile"><span className="label">Puls</span><b data-testid="hr">{value(latest.hrBpm)}</b></div>
        <div className="tile"><span className="label">Trittfrequenz</span><b>{value(latest.cadenceRpm)}</b></div>
        {engine.gear !== null
          ? <div className="tile"><span className="label">Gang</span><b>{engine.gear}</b></div>
          : <div className="tile"><span className="label">Noch insgesamt</span><b>{totalLeft === null ? '–' : mmss(totalLeft)}</b></div>}
      </section>
      {session && <WorkoutBar session={session} elapsedS={engine.rideElapsedS} />}
      <footer className="row">
        <button className="secondary" onClick={() => send({ type: 'adjust', deltaPct: -5 })}>Leichter −5 %</button>
        <button className="secondary" onClick={() => send({ type: 'adjust', deltaPct: 5 })}>Härter +5 %</button>
        <button className="secondary" onClick={() => window.open('#film', 'film')}>Film-Modus</button>
        <span className="spacer" />
        <button className="ghost" onClick={() => setEnding(true)}>Beenden</button>
      </footer>
      {ending && (
        <div className="overlay">
          <div role="dialog" className="card dialog">
            <h2>Training beenden?</h2>
            <p>Beim Verwerfen zählt diese Fahrt nicht: keine Bewertung, keine Änderung am Plan, kein Export.</p>
            <div className="row">
              <button onClick={() => { setEnding(false); send({ type: 'stop' }); }}>Speichern und beenden</button>
              <button className="secondary" onClick={() => setEnding(false)}>Weiterfahren</button>
              <span className="spacer" />
              <button className="danger" onClick={() => { setEnding(false); send({ type: 'discard' }); }}>Verwerfen</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
