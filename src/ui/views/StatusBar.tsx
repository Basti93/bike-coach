import { zoneOf } from '../../shared/hr-zones';
import { hrZoneColor, rideHrMax } from '../hr-zone-style';
import type { DeviceKind } from '../../service/ble/device-port';
import type { ClientMessage, StateMessage } from '../../shared/protocol';
import { ProblemReport } from './ProblemReport';

const DEVICES: { kind: DeviceKind; label: string; id: string }[] = [
  { kind: 'trainer', label: 'Trainer', id: 'status-trainer' },
  { kind: 'hr', label: 'Puls', id: 'status-puls' },
  { kind: 'clicker', label: 'Clicker', id: 'status-clicker' },
];

const deviceText = (live: StateMessage | null, kind: DeviceKind): string => {
  if (!live) return 'unbekannt';
  if (live.devices[kind] === 'off') return 'getrennt';
  if (live.devices[kind] !== 'connected') return 'wird gesucht';
  return live.deviceNames?.[kind] ?? 'verbunden';
};

/** Visible on every page. Without a connection to the service it shows no old values. */
export const StatusBar = ({ state, connected, send, reportPath = null }: { state: StateMessage | null; connected: boolean; send?: (m: ClientMessage) => void; reportPath?: string | null }) => {
  const live = connected ? state : null;
  const hr = live?.latest.hrBpm;
  const beating = !!hr && hr > 0;
  const hrMax = rideHrMax(live, Date.now());
  const zoneColor = hrZoneColor(beating && hrMax ? zoneOf(hr, hrMax) : null);
  return (
    <div className="status-bar" role="status" aria-label="Gerätestatus">
      <span data-testid="status-hr">
        <span data-testid="heart" className={beating ? 'heart beating' : 'heart'} style={beating ? { animationDuration: `${60 / hr}s` } : undefined}>♥</span>
        {' '}<b style={{ color: zoneColor }}>{hr === null || hr === undefined ? '–' : Math.round(hr)}</b> bpm
      </span>
      {DEVICES.map(({ kind, label, id }) => (
        <span key={kind} className="status-device">
          <span data-testid={id} className={live?.devices[kind] === 'connected' ? 'dot on' : 'dot'}>{label}: {deviceText(live, kind)}</span>
          {live && send && (live.devices[kind] === 'off'
            ? <button className="status-action" aria-label={`${label} verbinden`} onClick={() => send({ type: 'device-connect', kind })}>Verbinden</button>
            : !(kind === 'trainer' && live.engine) && <button className="status-action" aria-label={`${label} trennen`} onClick={() => send({ type: 'device-disconnect', kind })}>Trennen</button>)}
        </span>
      ))}
      {live && send && <ProblemReport send={send} reportPath={reportPath} />}
    </div>
  );
};
