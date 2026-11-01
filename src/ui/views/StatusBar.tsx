import type { StateMessage } from '../../shared/protocol';

const trainerText = (live: StateMessage | null): string => {
  if (!live) return 'unbekannt';
  return live.devices.trainer === 'connected' ? 'verbunden' : 'wird gesucht';
};

/** Auf jeder Seite sichtbar. Ohne Verbindung zum Dienst zeigt sie keine alten Werte. */
export const StatusBar = ({ state, connected }: { state: StateMessage | null; connected: boolean }) => {
  const live = connected ? state : null;
  const hr = live?.latest.hrBpm;
  return (
    <div className="status-bar" role="status" aria-label="Gerätestatus">
      <span data-testid="status-hr">♥ <b>{hr === null || hr === undefined ? '–' : Math.round(hr)}</b> bpm</span>
      <span data-testid="status-trainer" className={live?.devices.trainer === 'connected' ? 'dot on' : 'dot'}>Trainer {trainerText(live)}</span>
    </div>
  );
};
