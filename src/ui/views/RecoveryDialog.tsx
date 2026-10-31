import type { ClientMessage, RecoveryOffer } from '../../shared/protocol';
import { mmss } from './RideView';

export const RecoveryDialog = ({ offer, profileName, send, onClose }: { offer: RecoveryOffer; profileName: string; send: (m: ClientMessage) => void; onClose: () => void }) => (
  <div className="overlay">
    <div role="dialog" className="card dialog">
      <h2>Unterbrochene Fahrt gefunden</h2>
      <p>{profileName}: „{offer.sessionName}“ bei {mmss(offer.rideElapsedS)}. Alle Daten sind gespeichert.</p>
      <div className="row">
        <button onClick={() => { send({ type: 'resume', rideId: offer.rideId }); onClose(); }}>Weiterfahren</button>
        <button className="secondary" onClick={() => { send({ type: 'discard-resume', rideId: offer.rideId }); onClose(); }}>Fahrt hier beenden</button>
      </div>
    </div>
  </div>
);
