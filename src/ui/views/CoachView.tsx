import { useState } from 'react';
import type { CoachState } from '../../coach/state';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import type { Profile } from '../../shared/profiles';
import type { ClientMessage } from '../../shared/protocol';
import type { Session } from '../../shared/session';
import { STARTER_SESSIONS } from '../../shared/starter-sessions';

const NOTICE: Record<string, string> = {
  limit: 'Das Limit deines Claude-Plans ist gerade erreicht. Diese Einheit stammt vom Regelwerk, der Coach versucht es später erneut.',
  missing: 'Claude wurde auf diesem Mac nicht gefunden. Diese Einheit stammt vom Regelwerk.',
  timeout: 'Claude hat nicht rechtzeitig geantwortet. Diese Einheit stammt vom Regelwerk, der Coach versucht es später erneut.',
  invalid: 'Der Vorschlag von Claude passte nicht zu den Leitplanken. Diese Einheit stammt vom Regelwerk.',
  failed: 'Claude war gerade nicht erreichbar. Diese Einheit stammt vom Regelwerk, der Coach versucht es später erneut.',
};
const minutes = (s: Session) => Math.round(s.steps.reduce((a, x) => a + x.durationS, 0) / 60);

type Props = {
  profile: Profile; state: CoachState | null; thinking: boolean; coachConnected: boolean;
  sendRide: (m: ClientMessage) => void; sendCoach: (m: CoachClientMessage) => void; onBack: () => void;
};

export const CoachView = ({ profile, state, thinking, coachConnected, sendRide, sendCoach, onBack }: Props) => {
  const [note, setNote] = useState('');
  const ftpW = state?.ftpW ?? profile.ftpW;
  const start = (session: Session) => sendRide({ type: 'start', profileId: profile.id, session, ftpW, ...(profile.maxHrBpm ? { maxHrBpm: profile.maxHrBpm } : {}) });
  const next = state?.next;
  const isRamp = next?.session.id === 'ramp-test';
  const adjust = (how: 'easier' | 'harder' | 'shorter') => sendCoach({ type: 'adjust', profileId: profile.id, how });
  const sendNote = () => {
    if (!note.trim()) return;
    sendCoach({ type: 'note', profileId: profile.id, text: note.trim() });
    setNote('');
  };
  return (
    <main>
      <h1>Hallo {profile.name}</h1>
      {!state && <p role="status">{coachConnected ? 'Coach lädt…' : 'Der Coach ist gerade nicht erreichbar. Du kannst trotzdem fahren.'}</p>}
      {next && (
        <section>
          <h2>{next.session.name} · {minutes(next.session)} Minuten</h2>
          <p>{next.reason}</p>
          {isRamp && <p>Die Rampe wird jede Minute schwerer. Fahre, bis es nicht mehr geht, und drücke dann „Beenden“. Das Ergebnis wird gespeichert.</p>}
          {next.source === 'rules' && state.lastError && <p role="status">{NOTICE[state.lastError]}</p>}
          {thinking && <p>Der Coach denkt gerade nach. Fahren kannst du trotzdem jederzeit.</p>}
          <div className="row">
            <button onClick={() => start(next.session)}>Los</button>
            {!isRamp && (
              <>
                <button className="secondary" onClick={() => adjust('easier')}>Leichter</button>
                <button className="secondary" onClick={() => adjust('harder')}>Härter</button>
                <button className="secondary" onClick={() => adjust('shorter')}>Kürzer</button>
              </>
            )}
          </div>
        </section>
      )}
      <details open={!state}>
        <summary>Andere Einheit wählen</summary>
        <div className="row">{STARTER_SESSIONS.map((s) => <button key={s.id} className="secondary" onClick={() => start(s)}>{s.name}</button>)}</div>
      </details>
      {state && (
        <>
          <section>
            <h3>Dein Plan</h3>
            <p>Phase: {state.phase.name}{state.phase.weeksLeft > 0 ? `, noch etwa ${state.phase.weeksLeft} Wochen` : ''}. {state.phase.goal}</p>
            <p>FTP jetzt: {state.ftpW} W{state.ftpForecast.map((f) => `, in ${f.weeksAhead} Wochen etwa ${f.ftpW} W`).join('')}</p>
          </section>
          <section>
            <h3>Hinweis an den Coach</h3>
            <div className="row">
              <input aria-label="Hinweis an den Coach" placeholder="zum Beispiel: Knie zwickt" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="secondary" onClick={sendNote}>Senden</button>
            </div>
            {state.notes.slice(-3).map((n) => <p key={n.atMs}>{n.text}{n.reply ? ` → ${n.reply}` : ''}</p>)}
          </section>
          {state.changes.length > 0 && (
            <section>
              <h3>Was der Coach geändert hat</h3>
              <ul>{[...state.changes].reverse().slice(0, 10).map((c) => <li key={c.atMs}>{c.text}</li>)}</ul>
            </section>
          )}
        </>
      )}
      <p><button className="secondary" onClick={onBack}>Profil wechseln</button></p>
    </main>
  );
};
