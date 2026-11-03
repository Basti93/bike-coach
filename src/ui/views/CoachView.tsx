import { useState, type ReactNode } from 'react';
import { hrMaxFor } from '../../shared/hr-zones';
import { CoachLog } from './CoachLog';
import { Encouragement, MotivationCard } from './MotivationCard';
import type { CoachState } from '../../coach/state';
import type { Together } from '../../coach/together';
import type { CoachClientMessage, GarminStatus, GarminSyncInfo } from '../../shared/coach-protocol';
import type { Profile } from '../../shared/profiles';
import type { ClientMessage } from '../../shared/protocol';
import type { Session } from '../../shared/session';
import { STARTER_SESSIONS } from '../../shared/starter-sessions';
import { rampTest } from '../../coach/rules';
import { GarminProfileBanner } from './GarminProfileReview';
import type { GarminSuggestion } from '../../shared/garmin-profile';
import { ReadinessNote } from './ReadinessNote';
import type { GarminReadiness } from '../../shared/garmin';
import { SessionFacts, StepList, TrainingCard } from './TrainingCard';
import { TogetherCard } from './TogetherCard';
import { WorkoutBar } from './WorkoutBar';
import { MobilityCard } from './MobilityCard';
import type { MobilityView } from '../../coach/mobility/mobility';

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
const greeting = (): string => {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Schön, dich zu sehen' : 'Guten Abend';
};

type Choice = { session: Session; why: string; tag: string };

type Props = {
  together?: Together | null;
  profile: Profile; state: CoachState | null; thinking: boolean; coachConnected: boolean;
  sendRide: (m: ClientMessage) => void; sendCoach: (m: CoachClientMessage) => void; passCard?: ReactNode;
  /** Only for a Garmin login that has run out: the connections themselves live on the profile page. */
  garmin?: GarminStatus; garminSync?: GarminSyncInfo | null; onProfile?: () => void;
  garminReadiness?: GarminReadiness | null; garminSuggestion?: GarminSuggestion | null; onReviewGarmin?: () => void; mobility?: MobilityView | null;
};

export const CoachView = ({ together, profile, state, thinking, coachConnected, sendRide, sendCoach, passCard, garmin, garminSync, onProfile, garminReadiness, garminSuggestion, onReviewGarmin, mobility }: Props) => {
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Choice | null>(null);
  const ftpW = state?.ftpW ?? profile.ftpW;
  const hrMax = hrMaxFor(profile, Date.now());
  const reauth = garmin?.state === 'connected' && garminSync?.problem === 'reauth';
  const start = (session: Session) => sendRide({ type: 'start', profileId: profile.id, session, ftpW, ...(profile.maxHrBpm ? { maxHrBpm: profile.maxHrBpm } : {}), ...(hrMax ? { hrMaxBpm: hrMax.bpm } : {}) });
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
    <main className="home">
      <div className="top">
        <h1>{profile.avatar && <span aria-hidden="true">{profile.avatar} </span>}{greeting()}, {profile.name}<span className="leaf" aria-hidden="true">🍁</span></h1>
      </div>
      {!state && <p className="notice" role="status">{coachConnected ? 'Coach lädt…' : 'Der Coach ist gerade nicht erreichbar. Du kannst trotzdem fahren.'}</p>}
      {state && (
        <Encouragement state={state}>
          <form className="note-form" onSubmit={(e) => { e.preventDefault(); sendNote(); }}>
            <input aria-label="Hinweis an den Coach" placeholder="Sag deinem Coach etwas, z. B. Knie zwickt" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="submit" className="secondary">Senden</button>
          </form>
          <CoachLog notes={state.notes} changes={state.changes} />
        </Encouragement>
      )}
      <ReadinessNote readiness={garminReadiness} />
      {reauth && coachConnected && (
        <p className="notice row" role="status">
          <span>Die Garmin-Anmeldung ist abgelaufen. Unter Profil kannst du dich in Ruhe neu anmelden.</span>
          {onProfile && <button className="ghost" onClick={onProfile}>Zum Profil</button>}
        </p>
      )}
      {onReviewGarmin && <GarminProfileBanner profile={profile} ftpW={ftpW} suggestion={garminSuggestion} onReview={onReviewGarmin} />}
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
          <MobilityCard profileId={profile.id} mobility={mobility} send={sendCoach} />
          <section className="library">
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
            <MotivationCard state={state} send={sendCoach} />
            {together && <TogetherCard together={together} />}
            <section className="card">
              <h3>Dein Plan</h3>
              <p className="note"><b>{state.phase.name}</b>{state.phase.weeksLeft > 0 ? `, noch etwa ${state.phase.weeksLeft} Wochen` : ''}. {state.phase.goal}</p>
              <p className="muted">FTP {state.ftpW} W{state.ftpHistory.some((h) => h.source === 'ramp') ? '' : ', geschätzt'}</p>
            </section>
            {(state.rules?.length ?? 0) > 0 && (
              <section className="card">
                <h3>Das merkt sich der Coach</h3>
                <ul className="rules">
                  {state.rules!.map((r) => (
                    <li key={r.atMs}><span>{r.text}</span><button className="ghost" onClick={() => sendCoach({ type: 'remove-rule', profileId: profile.id, atMs: r.atMs })}>Entfernen</button></li>
                  ))}
                </ul>
              </section>
            )}
            {coachConnected && passCard}
          </div>
        )}
      </div>
    </main>
  );
};
