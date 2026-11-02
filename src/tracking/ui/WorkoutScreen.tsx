import { useEffect, useRef, useState } from 'react';
import type { GymWorkout } from '../../coach/gym/types';
import type { Exercise } from '../../shared/exercises';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import {
  addExercise, addSet, confirmSet, editNotes, editSet, removeExercise, removeSet, restRemainingS, startEmpty, startFromPlan,
  swapExercise, unconfirmSet, type FinishChoice, type TrackedWorkout,
} from '../session';
import { acquireStore, closeStore, releaseStore } from '../registry';
import { createWorkoutStore } from '../store';
import { ExercisePicker } from './ExercisePicker';
import { finishedWorkouts, useCatalog, usePortRecords, useStoreView, useTick, useWakeLock, type WorkoutStore } from './hooks';
import { clock, dateLabel } from './labels';
import { NotesField } from './NotesField';
import { SetRow } from './SetRow';
import { SyncNote } from './SyncNote';

type Picker = { mode: 'add' } | { mode: 'swap'; ex: string } | null;
type Ask = { question: 'nothing-confirmed' } | { question: 'open-sets'; open: number } | null;

function ActiveWorkout({ port, store, history, now, newId, autoEnd, onLeave }: {
  port: TrackingPort; store: WorkoutStore; history: LoggedWorkout[]; now: () => number; newId: () => string; autoEnd: boolean; onLeave: (message: string) => void;
}) {
  const { workout: w, save } = useStoreView(store);
  const [picker, setPicker] = useState<Picker>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const ending = useRef(false);
  const leaving = useRef(false);
  const remote = usePortRecords(port, 'workout').all;
  const [notice, setNotice] = useState<string | null>(null);
  const pendingLeave = useRef<string | null>(null);
  useWakeLock(true);
  useTick(w.rest != null);
  // Leaving the screen: a clean store is let go, a dirty one keeps retrying in the registry until it is clean.
  useEffect(() => () => releaseStore(port, store), [store, port]);
  const remaining = restRemainingS(w, now());

  // Unsaved work on this device always wins. Only a clean store steps aside for what happened elsewhere.
  useEffect(() => {
    if (!remote || leaving.current) return;
    const rec = remote.find((r) => r.id === w.id);
    if (rec && rec.updatedMs <= store.updatedMs()) return; // ours, or older
    const stepAside = (leave: string, stay: string) => {
      store.flushDrafts(); // a note still being typed counts as unsaved work
      if (store.dirty()) { if (rec) store.reload(rec); setNotice(stay); return; }
      closeStore(port, store);
      onLeave(leave);
    };
    if (!rec) {
      if (!store.everSaved()) return; // never saved yet: the list cannot know it, keep it open and keep retrying
      stepAside('Dieses Training wurde auf einem anderen Gerät gelöscht. Die Ansicht wurde neu geladen.', 'Dieses Training wurde auf einem anderen Gerät gelöscht. Deine Änderungen hier bleiben offen und werden weitergeschrieben.');
    } else if (rec.deleted) {
      stepAside('Dieses Training wurde auf einem anderen Gerät gelöscht. Die Ansicht wurde neu geladen.', 'Dieses Training wurde auf einem anderen Gerät gelöscht. Deine Änderungen hier bleiben offen und werden weitergeschrieben.');
    } else if ((rec.body as LoggedWorkout).endMs !== null) {
      stepAside('Dieses Training wurde auf einem anderen Gerät beendet. Die Ansicht wurde neu geladen.', 'Dieses Training wurde auf einem anderen Gerät beendet. Deine ungespeicherten Änderungen hier bleiben offen und werden weitergeschrieben.');
    } else {
      store.reload(rec);
    }
  }, [remote]); // eslint-disable-line react-hooks/exhaustive-deps

  // A finish that could not be saved at first leaves the screen once a retry succeeds.
  useEffect(() => {
    if (pendingLeave.current && save === 'saved' && w.endMs !== null) { const m = pendingLeave.current; pendingLeave.current = null; closeStore(port, store); onLeave(m); }
  }, [save, w]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: (x: TrackedWorkout) => TrackedWorkout) => void store.apply(fn);

  async function end(choice?: FinishChoice) {
    if (ending.current) return;
    ending.current = true; leaving.current = true;
    try {
      const r = await store.finish(choice);
      if (r.status === 'ask') { leaving.current = false; setAsk(r); return; }
      setAsk(null);
      const msg = r.status === 'discard' ? 'Das Training wurde verworfen.' : 'Training gespeichert. Gut gemacht.';
      if (!r.saved) {
        if (r.status === 'finished') pendingLeave.current = msg; // stays here, calmly, until a retry works
        else leaving.current = false;
        return;
      }
      closeStore(port, store);
      onLeave(msg);
    } finally { ending.current = false; }
  }
  useEffect(() => { if (autoEnd) void end(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tk-screen">
      <h1 className="tk-title">{w.title}</h1>
      <p className="muted">Gestartet {dateLabel(w.startMs)}</p>
      {save === 'unsaved' && (
        <p role="status" className="tk-note">
          Gerade nicht gespeichert. Dein Training bleibt hier offen und wird mit dem nächsten Schritt erneut gespeichert.
          {' '}<button type="button" className="secondary" onClick={() => act((x) => x)}>Jetzt nochmal speichern</button>
        </p>
      )}
      {notice && <p role="note" className="tk-note">{notice}</p>}
      {w.rest && remaining > 0 && (
        <div role="timer" className="tk-rest">
          <span>Pause {clock(remaining)}</span>
          <button type="button" className="ghost" onClick={() => act((x) => ({ ...x, rest: null }))}>Pause überspringen</button>
        </div>
      )}
      {w.exercises.map((e) => (
        <section key={e.rid} className="tk-ex card" aria-label={e.title}>
          <div className="tk-row">
            <h2>{e.title}</h2>
            {e.supersetId !== null && <span className="muted">Superset</span>}
            <span className="spacer" />
            <button type="button" className="ghost" aria-label={`${e.title} tauschen`} onClick={() => setPicker({ mode: 'swap', ex: e.rid })}>Tauschen</button>
            <button type="button" className="ghost" aria-label={`${e.title} entfernen`}
              onClick={() => (store.current().exercises.find((x) => x.rid === e.rid)?.sets.some((s) => s.doneMs !== null) ? setRemoving(e.rid) : act((x) => removeExercise(x, e.rid)))}>Entfernen</button>
          </div>
          {removing === e.rid && (
            <p className="tk-note">
              Die erledigten Sätze dieser Übung gehen dabei weg. Wirklich entfernen?{' '}
              <button type="button" onClick={() => { setRemoving(null); act((x) => removeExercise(x, e.rid)); }}>Ja, entfernen</button>{' '}
              <button type="button" className="ghost" onClick={() => setRemoving(null)}>Behalten</button>
            </p>
          )}
          {e.sets.map((s, si) => (
            <SetRow key={s.rid} index={si} set={s} timed={!!e.timed}
              confirmedNow={() => store.current().exercises.find((x) => x.rid === e.rid)?.sets.find((x) => x.rid === s.rid)?.doneMs != null}
              onEdit={(patch) => act((x) => editSet(x, e.rid, s.rid, patch))}
              onToggle={() => act((x) => (s.doneMs === null ? confirmSet(x, e.rid, s.rid, now()) : unconfirmSet(x, e.rid, s.rid)))}
              onRemove={() => act((x) => removeSet(x, e.rid, s.rid))} />
          ))}
          <div className="tk-row">
            <button type="button" className="secondary" onClick={() => act((x) => addSet(x, e.rid))}>Satz hinzufügen</button>
            <NotesField store={store} label={`Notiz zu ${e.title}`} value={e.notes} onCommit={(text) => act((x) => editNotes(x, e.rid, text))} />
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
              <p>Noch kein Satz ist als erledigt markiert. Was soll mit dem Training passieren?</p>
              <button type="button" onClick={() => void end('complete')}>Alle Sätze als erledigt markieren</button>
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

function OpenCard({ rec, primary, onResume, onEnd, onDiscard }: { rec: TrackedRecord; primary: boolean; onResume: () => void; onEnd: () => void; onDiscard: () => Promise<void> }) {
  const w = rec.body as LoggedWorkout;
  const [asking, setAsking] = useState(false);
  const sfx = primary ? '' : ` ${w.title} ${dateLabel(w.startMs)}`;
  return (
    <div className="card tk-open">
      <h2>{primary ? 'Dein Training ist noch offen' : `${w.title}, offen`}</h2>
      <p className="muted">{w.title}, gestartet {dateLabel(w.startMs)}. Alles ist gespeichert, du kannst genau dort weitermachen.</p>
      <div className="tk-row">
        <button type="button" onClick={onResume}>{`Training fortsetzen${sfx}`}</button>
        <button type="button" className="secondary" onClick={onEnd}>{`Training beenden${sfx}`}</button>
        <button type="button" className="ghost" onClick={() => setAsking(true)}>{`Training verwerfen${sfx}`}</button>
      </div>
      {asking && (
        <p className="tk-note">Verwerfen löscht dieses Training samt erledigter Sätze. Wirklich verwerfen?{' '}
          <button type="button" onClick={() => void onDiscard().then(() => setAsking(false))}>Ja, verwerfen</button>{' '}
          <button type="button" className="ghost" onClick={() => setAsking(false)}>Behalten</button>
        </p>
      )}
    </div>
  );
}

export function WorkoutScreen({ port, plan = null, routine = null, now = Date.now, newId = () => crypto.randomUUID() }: {
  port: TrackingPort; plan?: GymWorkout | null; routine?: GymWorkout | null; now?: () => number; newId?: () => string;
}) {
  const workoutsQ = usePortRecords(port, 'workout');
  const routinesQ = usePortRecords(port, 'routine');
  const workouts = workoutsQ.records;
  const catalog = useCatalog(port);
  const [store, setStore] = useState<{ s: WorkoutStore; autoEnd: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const starting = useRef(false);
  const started = useRef<GymWorkout | null>(null);
  const history = finishedWorkouts(workouts);
  const openRecs = (workouts ?? []).filter((r) => (r.body as LoggedWorkout).endMs === null).sort((a, b) => (b.body as LoggedWorkout).startMs - (a.body as LoggedWorkout).startMs);

  async function begin(w: TrackedWorkout) {
    if (starting.current) return; // a double tap makes one workout
    starting.current = true;
    try {
      const s = acquireStore(port, w, now);
      await s.apply((x) => x); // saved (or flagged) before the screen shows it
      setMessage(null);
      setStore({ s, autoEnd: false });
    } finally { starting.current = false; }
  }
  const startPlan = (g: GymWorkout) => begin(startFromPlan(g, history, now(), newId(), catalog));

  useEffect(() => {
    if (routine && workouts && openRecs.length === 0 && !store && started.current !== routine) { started.current = routine; void startPlan(routine); }
  }, [routine, workouts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (store) return <ActiveWorkout port={port} store={store.s} history={history} now={now} newId={newId} autoEnd={store.autoEnd} onLeave={(m) => { setStore(null); setMessage(m); }} />;
  if (workoutsQ.failed) {
    return (
      <div className="tk-screen">
        <p role="status" className="tk-note">Deine Trainings konnten gerade nicht gelesen werden. Es ist nichts verloren, versuch es gleich nochmal.</p>
        <button type="button" onClick={workoutsQ.retry}>Nochmal versuchen</button>
      </div>
    );
  }
  if (workouts === null) return <div className="tk-screen"><p className="muted">Einen Moment …</p></div>;

  if (openRecs.length > 0) {
    return (
      <div className="tk-screen">
        {message && <p role="status" className="tk-note">{message}</p>}
        {openRecs.map((rec, i) => (
          <OpenCard key={rec.id} rec={rec} primary={i === 0}
            onResume={() => setStore({ s: acquireStore(port, rec, now), autoEnd: false })}
            onEnd={() => setStore({ s: acquireStore(port, rec, now), autoEnd: true })}
            onDiscard={async () => {
              // One-shot: a throwaway store, disposed at once, so a failed delete is never retried.
              const once = createWorkoutStore(port, rec, now);
              const ok = await once.remove().finally(() => once.dispose());
              if (!ok) setMessage('Gerade nicht gespeichert. Das Training bleibt offen, versuch es gleich nochmal.');
            }} />
        ))}
      </div>
    );
  }

  return (
    <div className="tk-screen">
      {message && <p role="status" className="tk-note">{message}</p>}
      <SyncNote port={port} />
      <h1 className="tk-title">Training starten</h1>
      {plan && <button type="button" onClick={() => void startPlan(plan)}>{plan.name} starten</button>}
      {(routinesQ.records ?? []).map((r) => {
        const body = r.body as GymWorkout;
        return <button type="button" key={r.id} className="secondary" onClick={() => void startPlan(body)}>{body.name} starten</button>;
      })}
      <button type="button" className="ghost" onClick={() => void begin(startEmpty(now(), newId()))}>Leeres Training starten</button>
    </div>
  );
}
