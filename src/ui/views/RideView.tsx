import { useEffect } from 'react';
import type { ClientMessage, StateMessage } from '../../shared/protocol';

const WARN_BEFORE_S = 15;
const value = (n: number | null | undefined) => (n === null || n === undefined ? '–' : String(Math.round(n)));
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const RideView = ({ state, send, compact = false }: { state: StateMessage; send: (m: ClientMessage) => void; compact?: boolean }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') send({ type: 'shift', dir: 'up' });
      if (e.key === 'ArrowDown') send({ type: 'shift', dir: 'down' });
      if (e.key === 'm') send({ type: 'mark' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const { engine, latest, devices } = state;
  if (!engine) return null;
  const target = engine.gradePct !== null ? `${engine.gradePct.toFixed(1)} %` : `${value(engine.targetW)} W`;
  return (
    <main className={compact ? 'film' : undefined}>
      {state.storageError && <div role="alert">Speichern schlägt gerade fehl. Die Fahrt läuft weiter, bitte Speicherplatz prüfen.</div>}
      {engine.nextLabel && engine.secondsToNext <= WARN_BEFORE_S && (
        <div role="alert">In {engine.secondsToNext} s: {engine.nextLabel}</div>
      )}
      {engine.paused && <div role="status">Pause. Tritt an, dann geht es weiter.</div>}
      {!compact && <h2>{engine.label}</h2>}
      {!compact && engine.autoReducedPct > 0 && <p role="status">Vorgabe automatisch um {engine.autoReducedPct} % gesenkt.</p>}
      <div className="grid">
        <div className="tile">Vorgabe<b data-testid="target">{target}</b></div>
        <div className="tile">Leistung<b data-testid="power">{value(latest.powerW)} W</b></div>
        <div className="tile">Puls<b data-testid="hr">{value(latest.hrBpm)}</b></div>
        <div className="tile">Trittfrequenz<b>{value(latest.cadenceRpm)}</b></div>
        <div className="tile">Restzeit Abschnitt<b data-testid="remaining">{mmss(engine.stepRemainingS)}</b></div>
        {engine.gear !== null && <div className="tile">Gang<b>{engine.gear}</b></div>}
      </div>
      {!compact && (
        <>
          <p>Trainer: {devices.trainer === 'connected' ? 'verbunden' : 'sucht…'} · Puls: {devices.hr === 'connected' ? 'verbunden' : 'sucht…'}</p>
          <div className="row">
            <button className="secondary" onClick={() => send({ type: 'adjust', deltaPct: -5 })}>Leichter −5 %</button>
            <button className="secondary" onClick={() => send({ type: 'adjust', deltaPct: 5 })}>Härter +5 %</button>
            <button className="secondary" onClick={() => window.open('#film', 'film')}>Film-Modus</button>
            <button className="secondary" onClick={() => { if (window.confirm('Fahrt beenden? Sie wird gespeichert.')) send({ type: 'stop' }); }}>Beenden</button>
          </div>
        </>
      )}
    </main>
  );
};
