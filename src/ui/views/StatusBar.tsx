import type { DeviceKind } from '../../service/ble/device-port';
import type { StateMessage } from '../../shared/protocol';

const DEVICES: { kind: DeviceKind; label: string; id: string }[] = [
  { kind: 'trainer', label: 'Trainer', id: 'status-trainer' },
  { kind: 'hr', label: 'Puls', id: 'status-puls' },
  { kind: 'clicker', label: 'Clicker', id: 'status-clicker' },
];

const deviceText = (live: StateMessage | null, kind: DeviceKind): string => {
  if (!live) return 'unbekannt';
  if (live.devices[kind] !== 'connected') return 'wird gesucht';
  return live.deviceNames?.[kind] ?? 'verbunden';
};

/** Auf jeder Seite sichtbar. Ohne Verbindung zum Dienst zeigt sie keine alten Werte. */
export const StatusBar = ({ state, connected }: { state: StateMessage | null; connected: boolean }) => {
  const live = connected ? state : null;
  const hr = live?.latest.hrBpm;
  const beating = !!hr && hr > 0;
  return (
    <div className="status-bar" role="status" aria-label="Gerätestatus">
      <span data-testid="status-hr">
        <span data-testid="heart" className={beating ? 'heart beating' : 'heart'} style={beating ? { animationDuration: `${60 / hr}s` } : undefined}>♥</span>
        {' '}<b>{hr === null || hr === undefined ? '–' : Math.round(hr)}</b> bpm
      </span>
      {DEVICES.map(({ kind, label, id }) => (
        <span key={kind} data-testid={id} className={live?.devices[kind] === 'connected' ? 'dot on' : 'dot'}>{label}: {deviceText(live, kind)}</span>
      ))}
    </div>
  );
};
