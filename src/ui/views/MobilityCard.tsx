import { useState } from 'react';
import type { MobilityView } from '../../coach/mobility/mobility';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import { MobilityOffer } from '../../tracking/ui/MobilityOffer';

const localStore = {
  getItem: (k: string) => localStorage.getItem(k),
  setItem: (k: string, v: string) => localStorage.setItem(k, v),
};

type Props = { profileId: string; mobility: MobilityView | null | undefined; send: (m: CoachClientMessage) => void };

/** Mobility offered after a session. Welcome, never a must: nothing to answer, nothing carried over. The 6-week question is its own small card. */
export const MobilityCard = ({ profileId, mobility, send }: Props) => {
  const [text, setText] = useState('');
  if (!mobility || (!mobility.session && !mobility.askFeel)) return null;
  const { session, askFeel } = mobility;
  return (
    <>
      {session && <MobilityOffer key={session.id} session={session} hideKey={`bike-coach:mobility-not-today:${profileId}`} storage={localStore} now={Date.now} onDone={() => send({ type: 'mobility-done', profileId, sessionId: session.id })} />}
      {askFeel && (
        <section className="card mobility-feel small">
          <h3>Eine kleine Frage</h3>
          <div className="row">
            <input aria-label="Fühlst du dich beweglicher als vor ein paar Wochen?" placeholder="Fühlst du dich beweglicher als vor ein paar Wochen?" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="secondary" onClick={() => { if (text.trim()) { send({ type: 'mobility-feel', profileId, text: text.trim() }); setText(''); } }}>Antworten</button>
            <button className="ghost" onClick={() => { send({ type: 'mobility-feel', profileId, text: '' }); setText(''); }}>Überspringen</button>
          </div>
        </section>
      )}
    </>
  );
};
