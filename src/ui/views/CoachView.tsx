import { useState } from 'react';
import type { CoachState } from '../../coach/state';
import type { CoachClientMessage } from '../../shared/coach-protocol';
import type { Profile } from '../../shared/profiles';
import type { ClientMessage } from '../../shared/protocol';
import type { Session } from '../../shared/session';
import { STARTER_SESSIONS } from '../../shared/starter-sessions';
import { rampTest } from '../../coach/rules';
import { SessionFacts, StepList, TrainingCard } from './TrainingCard';
import { WorkoutBar } from './WorkoutBar';

const NOTICE: Record<string, string> = {
  limit: 'Das Limit deines Claude-Plans ist gerade erreicht. Diese Einheit stammt vom Regelwerk, der Coach versucht es später erneut.',
  missing: 'Claude wurde auf diesem Mac nicht gefunden. Diese Einheit stammt vom Regelwerk.',
  timeout: 'Claude hat nicht rechtzeitig geantwortet. Diese Einheit stammt vom Regelwerk, der Coach versucht es später erneut.',
  invalid: 'Der Vorschlag von Claude passte nicht zu den Leitplanken. Diese Einheit stammt vom Regelwerk.',
  failed: 'Claude war gerade nicht erreichbar. Diese Einheit stammt vom Regelwerk, der Coach versucht es später erneut.',
};
const KEPT: Record<string, string> = {
  limit: 'Das Limit deines Claude-Plans ist gerade erreicht. Die Einheit bleibt, der Coach berücksichtigt Neues beim nächsten Versuch.',
  missing: 'Claude wurde auf diesem Mac nicht gefunden. Die Einheit bleibt, bis der Coach wieder planen kann.',
  timeout: 'Claude hat nicht rechtzeitig geantwortet. Die Einheit bleibt, der Coach versucht es später erneut.',
  invalid: 'Der letzte Vorschlag von Claude passte nicht zu den Leitplanken. Die Einheit bleibt.',
  failed: 'Claude war gerade nicht erreichbar. Die Einheit bleibt, der Coach versucht es später erneut.',
};
type Choice = { session: Session; why: string; tag: string };

type Props = {
  profile: Profile; state: CoachState | null; thinking: boolean; coachConnected: boolean;
  sendRide: (m: ClientMessage) => void; sendCoach: (m: CoachClientMessage) => void; onBack: () => void;
};

export const CoachView = ({ profile, state, thinking, coachConnected, sendRide, sendCoach, onBack }: Props) => {
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Choice | null>(null);
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
  const library: Choice[] = [
    ...(state?.alternatives ?? []).map((a) => ({ session: a.session, why: a.why, tag: 'Vom Coach' })),
    ...STARTER_SESSIONS.map((session) => ({ session, why: session.description ?? '', tag: 'Standard' })),
    ...(isRamp ? [] : [{ session: rampTest(ftpW), why: 'Misst deine FTP genauer als die Schätzung. Bis du nicht mehr kannst.', tag: 'Test' }]),
  ];
  const shown = picked ?? (next ? { session: next.session, why: next.reason, tag: '' } : null);
  const shownRamp = shown?.session.id === 'ramp-test';
  return (
    <main>
      <div className="top">
        <h1>Hallo {profile.name}</h1>
        <button className="ghost" onClick={onBack}>Profil wechseln</button>
      </div>
      {!state && <p className="notice" role="status">{coachConnected ? 'Coach lädt…' : 'Der Coach ist gerade nicht erreichbar. Du kannst trotzdem fahren.'}</p>}
      <div className="coach">
        <div className="stack">
          {shown && (
            <section className="card next">
              <h3>{picked ? 'Deine Auswahl' : 'Deine nächste Einheit'}</h3>
              <h2>{shown.session.name}</h2>
              <WorkoutBar session={shown.session} />
              <SessionFacts session={shown.session} ftpW={ftpW} />
              <p>{shown.why}</p>
              {shownRamp && <p className="muted">Nach dem Warmup wird es jede Minute schwerer. Fahre, bis es nicht mehr geht, und drücke dann „Beenden“. Das Ergebnis wird gespeichert.</p>}
              {!picked && state?.lastError && <p className="notice" role="status">{next?.source === 'rules' ? NOTICE[state.lastError] : KEPT[state.lastError]}</p>}
              {!picked && thinking && <p className="muted">Der Coach denkt gerade nach. Fahren kannst du trotzdem jederzeit.</p>}
              <StepList session={shown.session} ftpW={ftpW} />
              <div className="row">
                <button className="go" onClick={() => start(shown.session)}>Los</button>
                {picked && next && <button className="secondary" onClick={() => setPicked(null)}>Zurück zum Vorschlag</button>}
                {!picked && isRamp && <button className="secondary" onClick={() => sendCoach({ type: 'skip-ramp', profileId: profile.id })}>Überspringen</button>}
                {!picked && !isRamp && (
                  <>
                    <button className="secondary" onClick={() => adjust('easier')}>Leichter</button>
                    <button className="secondary" onClick={() => adjust('harder')}>Härter</button>
                    <button className="secondary" onClick={() => adjust('shorter')}>Kürzer</button>
                  </>
                )}
              </div>
            </section>
          )}
          <section>
            <h3>Andere Trainings</h3>
            <div className="trainings">
              {library.map((t) => (
                <TrainingCard key={t.session.id} session={t.session} ftpW={ftpW} tag={t.tag} why={t.why} selected={picked?.session.id === t.session.id}
                  onPick={() => { setPicked(t); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
              ))}
            </div>
          </section>
        </div>
        {state && (
          <div className="stack">
            <section className="card">
              <h3>Dein Plan</h3>
              <div className="ftp">{state.ftpW}<small>W FTP{state.ftpHistory.some((h) => h.source === 'ramp') ? '' : ', geschätzt'}</small></div>
              {state.ftpForecast.length > 0 && (
                <div className="forecast">
                  {state.ftpForecast.map((f) => <span key={f.weeksAhead}><b>{f.ftpW} W</b>in {f.weeksAhead} Wochen</span>)}
                </div>
              )}
              <p className="note"><b>{state.phase.name}</b>{state.phase.weeksLeft > 0 ? `, noch etwa ${state.phase.weeksLeft} Wochen` : ''}. {state.phase.goal}</p>
            </section>
            <section className="card">
              <h3>Hinweis an den Coach</h3>
              <form className="note-form" onSubmit={(e) => { e.preventDefault(); sendNote(); }}>
                <input aria-label="Hinweis an den Coach" placeholder="z. B. Knie zwickt" value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="submit" className="secondary">Senden</button>
              </form>
              {state.notes.slice(-3).map((n, i) => <p className="note" key={i}>{n.text}{n.reply && <span className="reply">{n.reply}</span>}</p>)}
            </section>
            {state.changes.length > 0 && (
              <section className="card">
                <h3>Was der Coach geändert hat</h3>
                <ul className="changes">{[...state.changes].reverse().slice(0, 5).map((c, i) => <li key={i}>{c.text}</li>)}</ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
};
