import type { ClientMessage, StateMessage } from '../../shared/protocol';
import { rideHrMax } from '../hr-zone-style';
import { RideView } from './RideView';

export const FilmView = ({ state, send }: { state: StateMessage | null; send: (m: ClientMessage) => void }) =>
  state?.engine ? <RideView state={state} send={send} compact hrMaxBpm={rideHrMax(state, Date.now())} /> : <main className="film">Keine laufende Fahrt</main>;
