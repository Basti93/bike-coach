import type { ClientMessage, StateMessage } from '../../shared/protocol';
import { rideHrMax } from '../hr-zone-style';
import { RideView } from './RideView';

/** Over a fullscreen video the main window sits on another desktop, so the way back is here. It does not jump by itself. */
export const FilmView = ({ state, send }: { state: StateMessage | null; send: (m: ClientMessage) => void }) =>
  state?.engine
    ? <RideView state={state} send={send} compact hrMaxBpm={rideHrMax(state, Date.now())} />
    : <main className="film">Keine laufende Fahrt<button className="secondary" onClick={() => window.open('#main', 'main')}>Zum Hauptfenster</button></main>;
