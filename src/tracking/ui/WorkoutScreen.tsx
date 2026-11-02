import { useState } from 'react';
import type { GymWorkout } from '../../coach/gym/types';
import type { Exercise } from '../../shared/exercises';
import type { LoggedWorkout } from '../../shared/records';
import type { TrackingPort } from '../ports';
import {
  addExercise, addSet, confirmSet, editNotes, editSet, finish, removeExercise, removeSet, restRemainingS, startEmpty, startFromPlan,
  swapExercise, unconfirmSet, type FinishChoice, type TrackedWorkout,
} from '../session';
import { createWorkoutStore } from '../store';
import { ExercisePicker } from './ExercisePicker';
import { finishedWorkouts, useCatalog, usePortRecords, useStoreView, useTick, useWakeLock, type WorkoutStore } from './hooks';
import { clock } from './labels';
import { SetRow } from './SetRow';
import { SyncNote } from './SyncNote';

type Picker = { mode: 'add' } | { mode: 'swap'; ex: number } | null;
type Ask = { question: 'nothing-confirmed' } | { question: 'open-sets'; open: number } | null;

function ActiveWorkout({ port, store, history, now, newId, onLeave }: {
  port: TrackingPort; store: WorkoutStore; history: LoggedWorkout[]; now: () => number; newId: () => string; onLeave: (message: string) => void;
}) {
  const { workout: w, save } = useStoreView(store);
  const [picker, setPicker] = useState<Picker>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  useWakeLock(true);
  useTick(w.rest != null);
  const remaining = restRemainingS(w, now());

  const act = (fn: (x: TrackedWorkout) => TrackedWorkout) => void store.apply(fn);

  async function end(choice?: FinishChoice) {
    const r = finish(store.view().workout, now(), choice);
    if (r.status === 'ask') { setAsk(r); return; }
    setAsk(null);
    if (r.status === 'discard') { if (await store.remove()) onLeave('Das Training wurde verworfen.'); return; }
    if (await store.apply(() => r.workout)) onLeave('Training gespeichert. Gut gemacht.');
  }

  return (
    <div className="tk-screen">
      <h1 className="tk-title">{w.title}</h1>
      {save === 'unsaved' && (
        <p role="status" className="tk-note">
          Gerade nicht gespeichert. Dein Training bleibt hier offen und wird mit dem nächsten Schritt erneut gespeichert.
          {' '}<button type="button" className="secondary" onClick={() => act((x) => x)}>Jetzt nochmal speichern</button>
        </p>
      )}
      {w.rest && remaining > 0 && (
        <div role="timer" className="tk-rest">
          <span>Pause {clock(remaining)}</span>
          <button type="button" className="ghost" onClick={() => act((x) => ({ ...x, rest: null }))}>Pause überspringen</button>
        </div>
      )}
      {w.exercises.map((e, ei) => (
        <section key={ei} className="tk-ex card" aria-label={e.title}>
          <div className="tk-row">
            <h2>{e.title}</h2>
            {e.supersetId !== null && <span className="muted">Superset</span>}
            <span className="spacer" />
            <button type="button" className="ghost" aria-label={`${e.title} tauschen`} onClick={() => setPicker({ mode: 'swap', ex: ei })}>Tauschen</button>
            <button type="button" className="ghost" aria-label={`${e.title} entfernen`}
              onClick={() => (e.sets.some((s) => s.doneMs !== null) ? setRemoving(ei) : act((x) => removeExercise(x, ei)))}>Entfernen</button>
          </div>
          {removing === ei && (
            <p className="tk-note">
              Die erledigten Sätze dieser Übung gehen dabei weg. Wirklich entfernen?{' '}
              <button type="button" onClick={() => { setRemoving(null); act((x) => removeExercise(x, ei)); }}>Ja, entfernen</button>{' '}
              <button type="button" className="ghost" onClick={() => setRemoving(null)}>Behalten</button>
            </p>
          )}
          {e.sets.map((s, si) => (
            <SetRow key={si} index={si} set={s} timed={!!e.timed}
              onEdit={(patch) => act((x) => editSet(x, ei, si, patch))}
              onToggle={() => act((x) => (s.doneMs === null ? confirmSet(x, ei, si, now()) : unconfirmSet(x, ei, si)))}
              onRemove={() => act((x) => removeSet(x, ei, si))} />
          ))}
          <div className="tk-row">
            <button type="button" className="secondary" onClick={() => act((x) => addSet(x, ei))}>Satz hinzufügen</button>
            <input className="tk-notes" aria-label={`Notiz zu ${e.title}`} placeholder="Notiz" value={e.notes} onChange={(ev) => act((x) => editNotes(x, ei, ev.target.value))} />
          </div>
        </section>
      ))}
      <div className="tk-row">
        <button type="button" className="secondary" onClick={() => setPicker({ mode: 'add' })}>Übung hinzufügen</button>
        <span className="spacer" />
        <button type="button" onClick={() => void end()}>Training beenden</button>
      </div>
      {ask && (
        <div className="tk-ask card" role="group" aria-label="Training beenden">
          {ask.question === 'open-sets' ? (
            <>
              <p>{ask.open === 1 ? 'Ein Satz ist noch offen.' : `${ask.open} Sätze sind noch offen.`} Was soll mit {ask.open === 1 ? 'ihm' : 'ihnen'} passieren?</p>
              <button type="button" onClick={() => void end('complete')}>Offene Sätze als erledigt markieren</button>
              <button type="button" className="secondary" onClick={() => void end('omit')}>Offene Sätze weglassen</button>
              <button type="button" className="ghost" onClick={() => setAsk(null)}>Zurück zum Training</button>
            </>
          ) : (
            <>
              <p>Noch kein Satz ist als erledigt markiert. Soll das Training verworfen werden?</p>
              <button type="button" className="secondary" onClick={() => void end('discard')}>Training verwerfen</button>
              <button type="button" onClick={() => setAsk(null)}>Weiter trainieren</button>
            </>
          )}
        </div>
      )}
      {picker && (
        <ExercisePicker port={port} now={now} newId={newId} onClose={() => setPicker(null)}
          onPick={(ex: Exercise) => {
            const p = picker; setPicker(null);
            act((x) => (p.mode === 'swap' ? swapExercise(x, p.ex, ex, history) : addExercise(x, ex, history)));
          }} />
      )}
    </div>
  );
}

export function WorkoutScreen({ port, plan = null, now = Date.now, newId = () => crypto.randomUUID() }: {
  port: TrackingPort; plan?: GymWorkout | null; now?: () => number; newId?: () => string;
}) {
  const workouts = usePortRecords(port, 'workout');
  const routines = usePortRecords(port, 'routine');
  const catalog = useCatalog(port);
  const [store, setStore] = useState<WorkoutStore | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const history = finishedWorkouts(workouts);
  const openRec = (workouts ?? []).find((r) => (r.body as LoggedWorkout).endMs === null);

  async function begin(w: TrackedWorkout) {
    const s = createWorkoutStore(port, w, now);
    await s.apply((x) => x); // saved (or flagged) before the screen shows it
    setMessage(null);
    setStore(s);
  }

  if (store) return <ActiveWorkout port={port} store={store} history={history} now={now} newId={newId} onLeave={(m) => { setStore(null); setMessage(m); }} />;
  if (workouts === null) return <div className="tk-screen"><p className="muted">Einen Moment …</p></div>;

  if (openRec) {
    const w = openRec.body as TrackedWorkout;
    return (
      <div className="tk-screen">
        <div className="card">
          <h2>Dein Training ist noch offen</h2>
          <p className="muted">{w.title} ist gespeichert. Du kannst genau dort weitermachen.</p>
          <button type="button" onClick={() => setStore(createWorkoutStore(port, w, now))}>Training fortsetzen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tk-screen">
      {message && <p role="status" className="tk-note">{message}</p>}
      <SyncNote port={port} />
      <h1 className="tk-title">Training starten</h1>
      {plan && <button type="button" onClick={() => void begin(startFromPlan(plan, history, now(), newId(), catalog))}>{plan.name} starten</button>}
      {(routines ?? []).map((r) => {
        const body = r.body as GymWorkout;
        return <button type="button" key={r.id} className="secondary" onClick={() => void begin(startFromPlan(body, history, now(), newId(), catalog))}>{body.name} starten</button>;
      })}
      <button type="button" className="ghost" onClick={() => void begin(startEmpty(now(), newId()))}>Leeres Training starten</button>
    </div>
  );
}
