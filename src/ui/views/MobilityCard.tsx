import { useState } from 'react';
import type { MobilityView } from '../../coach/mobility/mobility';
import type { CoachClientMessage } from '../../shared/coach-protocol';

type Props = { profileId: string; mobility: MobilityView | null | undefined; send: (m: CoachClientMessage) => void };

/** Mobility offered after a session. Welcome, never a must: nothing to answer, nothing carried over. */
export const MobilityCard = ({ profileId, mobility, send }: Props) => {
  const [text, setText] = useState('');
  if (!mobility || (!mobility.session && !mobility.askFeel)) return null;
  const { session, askFeel } = mobility;
  return (
    <>
      {session && (
        <section className="card mobility">
          <h3>Beweglichkeit, wenn du magst</h3>
          <p>{session.reason}</p>
          <p className="muted">Etwa {session.minutes} Minuten, {session.exercises.length} Übungen.</p>
          <ol className="gym-list">
            {session.exercises.map((e) => <li key={e.id} className="gym-exercise"><b>{e.title}</b><p className="muted">{e.howTo}</p></li>)}
          </ol>
          <div className="row"><button className="go" onClick={() => send({ type: 'mobility-done', profileId, sessionId: session.id })}>Gemacht</button></div>
        </section>
      )}
      {askFeel && (
        <section className="card mobility-feel">
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
