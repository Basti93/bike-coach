import { useEffect, useRef, useState } from 'react';
import type { GymPublic } from '../../coach/gym/public';
import type { GymExercise, GymSet, GymWorkout } from '../../coach/gym/types';
import type { CoachClientMessage, GymConfirmResult } from '../../shared/coach-protocol';
import type { MobilityView } from '../../coach/mobility/mobility';
import { MobilityCard } from './MobilityCard';
import { GymOutlook } from '../../tracking/ui/GymOutlook';

type Props = {
  profileId: string;
  gym: GymPublic;
  preview: { workout: GymWorkout; edited: boolean; leftOut?: string[] } | null;
  previewFailed: boolean;
  result: GymConfirmResult | null;
  send: (m: CoachClientMessage) => void;
  /** Forgets an old preview and/or result, so neither stays visible. */
  clear: (what: 'preview' | 'result' | 'all') => void;
  mobility?: MobilityView | null;
  /** A workout is still open on this Mac: the start button then continues it. */
  openWorkout?: boolean;
  /** Opens one of the shared tracking screens. Without it the page shows no tracking buttons. */
  onTrack?: (screen: 'workout' | 'routines' | 'history') => void;
};

const SET_TYPE: Record<GymSet['type'], string> = { warmup: 'Aufwärmen', normal: '', failure: 'bis nichts mehr geht', dropset: 'Dropset' };

const setText = (s: GymSet): string => {
  const reps = s.repRange ? `${s.repRange.start}–${s.repRange.end}` : s.reps !== null ? String(s.reps) : null;
  const weight = s.weightKg ? `${String(s.weightKg).replace('.', ',')} kg` : 'nach Gefühl';
  const label = SET_TYPE[s.type];
  return `${reps ? `${reps} Wdh.` : 'Wdh. nach Gefühl'}, ${weight}${label ? ` · ${label}` : ''}`;
};

const Exercise = ({ e }: { e: GymExercise }) => (
  <li className="gym-exercise">
    <b>{e.title}</b>
    {e.supersetId !== null && <span className="muted"> · Superset</span>}
    <ul className="gym-sets">
      {e.sets.map((s, i) => <li key={i}>Satz {i + 1}: {setText(s)}</li>)}
    </ul>
    {e.restS ? <p className="muted">Pause {e.restS} s</p> : null}
    {e.notes && <p className="muted">{e.notes}</p>}
  </li>
);

const WorkoutList = ({ workout }: { workout: GymWorkout }) => <ol className="gym-list">{workout.exercises.map((e, i) => <Exercise key={i} e={e} />)}</ol>;

const Question = ({ q, profileId, send }: { q: string; profileId: string; send: Props['send'] }) => {
  const [text, setText] = useState('');
  return (
    <li className="gym-question">
      <p>{q}</p>
      <div className="row">
        <input aria-label={`Antwort auf: ${q}`} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="secondary" onClick={() => { if (text.trim()) send({ type: 'gym-answer', profileId, question: q, text: text.trim() }); }}>Antworten</button>
        <button className="ghost" onClick={() => send({ type: 'gym-skip-question', profileId, question: q })}>Überspringen</button>
      </div>
    </li>
  );
};

export const GymView = ({ profileId, gym, preview, previewFailed, result, send, clear, mobility, onTrack, openWorkout = false }: Props) => {
  const { state, ready, thinking } = gym;
  const next = state.next;
  const [note, setNote] = useState('');
  const confirming = useRef(false);
  const clearRef = useRef(clear);
  clearRef.current = clear;
  // A new result or a closed preview lets the next confirm through.
  useEffect(() => { confirming.current = false; }, [result, preview]);
  useEffect(() => () => clearRef.current('all'), []);

  const name = next?.workout.name ?? '';
  const canHevy = gym.hevy && ready && next !== null && next.workout.exercises.length > 0;
  const open = preview && canHevy && result !== 'stale' && result !== 'written';
  const confirm = () => {
    if (confirming.current) return;
    confirming.current = true;
    send({ type: 'gym-confirm', profileId, name });
  };
  const adjust = (how: 'easier' | 'harder' | 'shorter') => {
    // The shown preview would no longer match the workout.
    clear('all');
    send({ type: 'gym-adjust', profileId, how });
  };
  const sendNote = () => {
    if (!note.trim()) return;
    send({ type: 'gym-note', profileId, text: note.trim() });
    setNote('');
  };

  return (
    <main className="home gym">
      <div className="top">
        <h1>Kraft</h1>
      </div>
      {onTrack && (
        <div className="row">
          <button className="go" onClick={() => onTrack('workout')}>{openWorkout ? 'Training fortsetzen' : 'Training starten'}</button>
          <button className="secondary" onClick={() => onTrack('routines')}>Routinen</button>
          <button className="secondary" onClick={() => onTrack('history')}>Bisherige Trainings</button>
        </div>
      )}
      {!ready && <p className="notice" role="status">Dein Verlauf wird noch geladen. Das dauert beim ersten Mal etwas.</p>}
      {ready && !next && state.emptyReason && <p className="notice" role="status">{state.emptyReason}</p>}
      {ready && !next && !state.emptyReason && <p className="notice" role="status">{thinking ? 'Der Coach plant gerade dein Training.' : gym.hasHistory ? 'Der Coach konnte dein Training noch nicht planen. Er versucht es gleich noch einmal.' : gym.hevy ? 'Sobald du in Hevy trainiert hast, plant der Coach dein nächstes Training. Bis dahin gibt es nichts zu tun.' : 'Sobald du trainiert hast, plant der Coach dein nächstes Training. Bis dahin gibt es nichts zu tun.'}</p>}
      <div className="coach">
        <div className="stack">
          {next && (
            <section className="card next">
              <h3>Dein nächstes Krafttraining</h3>
              <h2>{next.workout.name}</h2>
              <p>{next.reason}</p>
              {thinking && <p className="muted">Der Coach denkt gerade nach.</p>}
              <WorkoutList workout={next.workout} />
              <div className="row">
                {canHevy && <button className="go" onClick={() => { clear('all'); send({ type: 'gym-preview', profileId }); }}>Nach Hevy</button>}
                <button className="secondary" onClick={() => adjust('easier')}>Leichter</button>
                <button className="secondary" onClick={() => adjust('harder')}>Härter</button>
                <button className="secondary" onClick={() => adjust('shorter')}>Kürzer</button>
              </div>
              <GymOutlook outlook={state.outlook} />
            </section>
          )}
          {previewFailed && !preview && !result && <p className="notice" role="status">Die Vorschau ist gerade nicht möglich. In Hevy wurde nichts verändert, du kannst es gleich noch einmal versuchen.</p>}
          {open && (
            <section className="card gym-preview">
              <h3>Vorschau: so landet es in Hevy</h3>
              <h2>{preview.workout.name}</h2>
              {preview.edited && <p className="notice" role="status">Die Routine wurde in Hevy verändert. Wenn du sie jetzt anlegst, wird sie überschrieben.</p>}
              {preview.leftOut && preview.leftOut.length > 0 && <p className="notice" role="status">Nicht nach Hevy übertragen, weil es dort keine passende Übung gibt: {preview.leftOut.join(', ')}.</p>}
              <WorkoutList workout={preview.workout} />
              {result === 'failed' && <p className="notice" role="alert">Das hat gerade nicht geklappt. Vielleicht ist Hevy kurz nicht erreichbar. Du kannst es noch einmal versuchen.</p>}
              <div className="row">
                {result === 'failed'
                  ? <button className="go" onClick={() => { clear('result'); confirming.current = true; send({ type: 'gym-confirm', profileId, name }); }}>Nochmal versuchen</button>
                  : preview.workout.exercises.length > 0 && <button className="go" onClick={confirm}>Jetzt anlegen</button>}
                <button className="ghost" onClick={() => clear('all')}>Abbrechen</button>
              </div>
            </section>
          )}
          {result === 'written' && <p className="notice" role="status">Fertig, das Training ist jetzt in Hevy angelegt. Viel Freude damit.</p>}
          {result === 'stale' && <p className="notice" role="status">Das Training hat sich inzwischen geändert. Bitte schau es dir noch einmal an und lege es dann neu an.</p>}
          <MobilityCard profileId={profileId} mobility={mobility} send={send} />
        </div>
        <div className="stack">
          {state.lastNote && (
            <section className="card">
              <h3>Vom Coach</h3>
              <p>{state.lastNote.text}</p>
              {state.lastNote.questions.length > 0 && (
                <ul className="gym-questions">
                  {state.lastNote.questions.map((q) => <Question key={q} q={q} profileId={profileId} send={send} />)}
                </ul>
              )}
            </section>
          )}
          <section className="card">
            <h3>Sag deinem Kraft-Coach etwas</h3>
            <form className="note-form" onSubmit={(e) => { e.preventDefault(); sendNote(); }}>
              <input aria-label="Hinweis an den Kraft-Coach" placeholder="z. B. Das Knie mag keine tiefen Kniebeugen" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="submit" className="secondary">Senden</button>
            </form>
          </section>
          {gym.complaints.length > 0 && (
            <p className="muted">Der Coach nimmt Rücksicht auf: {gym.complaints.map((c) => c.text).join(', ')}. Sag ihm unter Woche, wenn es wieder gut ist.</p>
          )}
        </div>
      </div>
    </main>
  );
};
