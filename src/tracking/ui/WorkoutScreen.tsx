import { useEffect, useMemo, useRef, useState } from 'react';
import type { GymWorkout } from '../../coach/gym/types';
import type { Exercise } from '../../shared/exercises';
import { readStats, STATS_ID } from '../../shared/stats';
import { exerciseImages, videoSearchUrl } from '../media';
import { resolveExercise } from '../exercise-identity';
import { describeExercise } from '../similar';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import {
  addExercise, addSet, confirmSet, editNotes, editSet, lastValues, removeExercise, removeSet, restRemainingS, durationLabel, linkSuperset, unlinkSuperset, startEmpty, startFromPlan,
  setEffort, setStudio, swapExercise, unconfirmSet, type FinishChoice, type TrackedWorkout,
} from '../session';
import { acquireStore, closeStore, releaseStore } from '../registry';
import { createWorkoutStore } from '../store';
import { ExerciseInfo, StepLine } from './ExerciseInfo';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseProposals } from './ExerciseProposals';
import { MuscleIcon } from './MuscleIcon';
import { finishedWorkouts, useCatalog, usePortRecords, useStoreView, useTick, useWakeLock, type WorkoutStore } from './hooks';
import { clock, dateLabel } from './labels';
import { NotesField } from './NotesField';
import { EffortQuestion, EFFORT_LABEL, effortQuestionsOn } from './EffortQuestion';
import { asksEffort } from '../effort';
import { WorkoutCoach } from './WorkoutCoach';
import { applyWorkoutChange } from '../workout-change';
import { SetHead, SetRow } from './SetRow';
import { exerciseHasNoWeight, previousSets, setHint, setLabels } from './setGrid';
import { SyncNote } from './SyncNote';
import { defaultStudio, knownStudios, studioName } from '../../shared/studio';
import { repRangeOf } from '../../shared/muscle-targets';
import { loadStepOverrides } from '../../shared/loads';
import { hereKey, plateLine, stepChange, stepHere } from '../steps';

const NEW_STUDIO = '\u0000new';

/** One light line: "Studio: <Name>" with a select of the known names and "Neues Studio …", which opens a text input. */
function StudioLine({ value, known, onChange }: { value: string | undefined; known: string[]; onChange: (name: string | undefined) => void }) {
  const [typing, setTyping] = useState(false);
  const names = value && !known.includes(value) ? [value, ...known] : known;
  const commit = (raw: string) => { setTyping(false); const typed = studioName(raw); const n = typed && (known.find((k) => k.toLowerCase() === typed.toLowerCase()) ?? typed); if (n) onChange(n); };
  return (
    <p className="muted tk-studio">
      <label htmlFor="tk-studio-select">Studio:</label>
      <select id="tk-studio-select" aria-label="Studio" value={typing ? NEW_STUDIO : (value ?? '')}
          onChange={(e) => (e.target.value === NEW_STUDIO ? setTyping(true) : onChange(e.target.value || undefined))}>
          {!value && <option value="">–</option>}
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value={NEW_STUDIO}>Neues Studio …</option>
        </select>
      {typing && (
        <input type="text" aria-label="Name des neuen Studios" maxLength={40} autoFocus
          onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); }} />
      )}
    </p>
  );
}

type Picker = { mode: 'add' } | { mode: 'swap'; ex: string } | null;
type Ask = { question: 'nothing-confirmed' } | { question: 'open-sets'; open: number } | null;

function ActiveWorkout({ port, store, history, now, newId, autoEnd, onLeave }: {
  port: TrackingPort; store: WorkoutStore; history: LoggedWorkout[]; now: () => number; newId: () => string; autoEnd: boolean; onLeave: (message: string) => void;
}) {
  const { workout: w, save } = useStoreView(store);
  const [picker, setPicker] = useState<Picker>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [info, setInfo] = useState<ReadonlySet<string>>(new Set());
  const toggleInfo = (rid: string) => setInfo((s) => { const n = new Set(s); if (!n.delete(rid)) n.add(rid); return n; });
  const ending = useRef(false);
  const leaving = useRef(false);
  const remote = usePortRecords(port, 'workout').all;
  const catalog = useCatalog(port);
  const statsRecords = usePortRecords(port, 'stats').records;
  const loadSteps = usePortRecords(port, 'loadstep').records;
  const overrides = useMemo(() => loadStepOverrides(loadSteps ?? []), [loadSteps]);
  const studioHere = hereKey(w, [...history]);
  const chooseStep = (exerciseId: string, stepKg: number | null) => {
    void port.list('loadstep').then((stored) => port.put(stepChange(stored, exerciseId, studioHere, stepKg, now()))).catch(() => setNotice('Gerade nicht gespeichert. Versuch es gleich nochmal.'));
  };
  const statsMuscles = useMemo(() => {
    const r = (statsRecords ?? []).find((x) => x.id === STATS_ID && !x.deleted);
    return (r && readStats(r.body)?.muscles) || null;
  }, [statsRecords]);
  const [notice, setNotice] = useState<string | null>(null);
  const [effortOn, setEffortOn] = useState(effortQuestionsOn);
  const pendingLeave = useRef<string | null>(null);
  useWakeLock(true);
  useTick(true); // the rest countdown and the total time
  // Leaving the screen: a clean store is let go, a dirty one keeps retrying in the registry until it is clean.
  useEffect(() => () => releaseStore(port, store), [store, port]);
  const remaining = restRemainingS(w, now());

  // Opening (or continuing) a workout scrolls once to the exercise with the next open set.
  const currentRid = w.exercises.find((x) => x.sets.some((st) => st.doneMs === null))?.rid ?? null;
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = screenRef.current?.querySelector('[aria-current="step"]');
    if (el && el !== screenRef.current?.querySelector('.tk-ex')) el.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The rest end is armed once per rest (not per tick); skipping or leaving cancels it.
  const restEnd = w.rest ? w.rest.startMs + w.rest.durationS * 1000 : null;
  useEffect(() => { port.restAlarm?.(restEnd !== null && restEnd > now() ? restEnd : null); }, [restEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { port.restAlarm?.(null); }, [port]);

  // Unsaved work on this device always wins. Only a clean store steps aside for what happened elsewhere.
  useEffect(() => {
    if (!remote || leaving.current) return;
    const rec = remote.find((r) => r.id === w.id);
    if (rec && rec.updatedMs <= store.updatedMs()) return; // ours, or older
    const copyNote = () => (remote.some((r) => !r.deleted && (r.body as LoggedWorkout).keptCopyOf === w.id) ? ' Die Fassung mit mehr Sätzen liegt als Kopie im Verlauf.' : '');
    const stepAside = (leave: string, stay: string) => {
      store.flushDrafts(); // a note still being typed counts as unsaved work
      if (store.dirty()) { if (rec) store.reload(rec); setNotice(stay); return; }
      closeStore(port, store);
      onLeave(leave);
    };
    if (!rec) {
      if (!store.everSaved()) return; // never saved yet: the list cannot know it, keep it open and keep retrying
      stepAside(`Dieses Training wurde auf einem anderen Gerät gelöscht. Die Ansicht wurde neu geladen.${copyNote()}`, 'Dieses Training wurde auf einem anderen Gerät gelöscht. Deine Änderungen hier bleiben offen und werden weitergeschrieben.');
    } else if (rec.deleted) {
      stepAside(`Dieses Training wurde auf einem anderen Gerät gelöscht. Die Ansicht wurde neu geladen.${copyNote()}`, 'Dieses Training wurde auf einem anderen Gerät gelöscht. Deine Änderungen hier bleiben offen und werden weitergeschrieben.');
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
      store.flushDrafts(); // a note still being typed is part of what gets finished
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
    <div className="tk-screen" ref={screenRef}>
      <h1 className="tk-title">{w.title}</h1>
      <p className="muted">Gestartet {dateLabel(w.startMs)} · <span role="timer" aria-label="Trainingsdauer" className="tk-elapsed">{durationLabel(now() - w.startMs)}</span></p>
      <StudioLine value={w.studio} known={knownStudios([...history, w])} onChange={(n) => act((x) => setStudio(x, n ?? ''))} />
      {save === 'unsaved' && (
        <p role="status" className="tk-note">
          Gerade nicht gespeichert. Dein Training bleibt hier offen und wird mit dem nächsten Schritt erneut gespeichert.
          {' '}<button type="button" className="secondary" onClick={() => act((x) => x)}>Jetzt nochmal speichern</button>
        </p>
      )}
      {notice && <p role="note" className="tk-note">{notice}</p>}
      <WorkoutCoach port={port} workout={w} catalog={catalog} now={now} newId={newId}
        onApply={(c) => act((x) => applyWorkoutChange(x, c, history, catalog))} />
      {w.rest && remaining > 0 && (
        <div role="timer" aria-label="Satzpause" className="tk-rest">
          <span>Pause {clock(remaining)}</span>
          <button type="button" className="tk-skip" onClick={() => act((x) => ({ ...x, rest: null }))}>Pause überspringen</button>
        </div>
      )}
      {w.exercises.map((e, ei) => {
        const nextEx = w.exercises[ei + 1];
        const canLink = !!nextEx && (e.supersetId === null || e.supersetId !== nextEx.supersetId);
        const labels = setLabels(e.sets);
        const firstWork = e.sets.findIndex((x) => x.type !== 'warmup');
        const before = previousSets(e.sets, lastValues(e.exerciseId, history, catalog));
        const timed = !!e.timed;
        const description = describeExercise(e, catalog);
        const resolved = resolveExercise(e, catalog, statsMuscles);
        const own = resolved.exercise;
        const equipment = own?.equipment ?? 'other';
        const range = repRangeOf({ primaryMuscle: own?.primaryMuscle });
        const plateRid = equipment === 'barbell' ? e.sets.find((x) => x.doneMs === null && x.weightKg !== null && x.weightKg > 0)?.rid : undefined;
        const icon = <MuscleIcon group={resolved.group} />;
        const showInfo = info.has(e.rid);
        const allDone = e.sets.length > 0 && e.sets.every((st) => st.doneMs !== null);
        const current = e.rid === currentRid;
        return (
          <section key={e.rid} className={`tk-ex card${allDone ? ' tk-ex-done' : ''}${current ? ' tk-ex-current' : ''}`} aria-label={e.title}
            aria-current={current ? 'step' : undefined}>
            <div className="tk-ex-head">
              <span className="tk-ex-icon">{icon}</span>
              <h2>{allDone && <span className="tk-ex-check" aria-hidden="true">✓ </span>}{e.title}</h2>
              {allDone && <span className="tk-ex-badge">Erledigt</span>}
              {e.supersetId !== null && <span className="muted">Superset</span>}
              <button type="button" className="ghost tk-more" aria-label={`Mehr zu ${e.title}`} aria-expanded={menu === e.rid} onClick={() => setMenu(menu === e.rid ? null : e.rid)}>…</button>
            </div>
            {menu === e.rid && (
              <div className="tk-row tk-menu">
                <button type="button" className="secondary" aria-label={`Ausführung ${e.title}`} aria-expanded={showInfo}
                  onClick={() => { setMenu(null); toggleInfo(e.rid); }}>Ausführung</button>
                {canLink && (
                  <button type="button" className="secondary" aria-label={`${e.title} als Superset mit ${nextEx!.title}`}
                    onClick={() => { setMenu(null); act((x) => linkSuperset(x, e.rid)); }}>Superset mit nächster Übung</button>
                )}
                {e.supersetId !== null && (
                  <button type="button" className="secondary" aria-label={`${e.title} aus dem Superset lösen`}
                    onClick={() => { setMenu(null); act((x) => unlinkSuperset(x, e.rid)); }}>Aus Superset lösen</button>
                )}
                <button type="button" className="secondary" aria-label={`${e.title} tauschen`} onClick={() => { setMenu(null); setPicker({ mode: 'swap', ex: e.rid }); }}>Tauschen</button>
                <button type="button" className="secondary" aria-label={`${e.title} entfernen`}
                  onClick={() => { setMenu(null); if (store.current().exercises.find((x) => x.rid === e.rid)?.sets.some((s) => s.doneMs !== null)) setRemoving(e.rid); else act((x) => removeExercise(x, e.rid)); }}>Entfernen</button>
              </div>
            )}
            {showInfo && (
              <ExerciseInfo title={e.title} description={description} icon={icon}
                images={own ? exerciseImages(own.id) : []} video={videoSearchUrl({ title: e.title, hevyTitle: own?.hevyTitle })}>
                <StepLine title={e.title} step={stepHere(e.exerciseId, equipment, history, studioHere, overrides)} onChoose={(kg) => chooseStep(e.exerciseId, kg)} />
                <button type="button" className="ghost tk-info-close" aria-label="Ausführung ausblenden" onClick={() => toggleInfo(e.rid)}>Ausblenden</button>
              </ExerciseInfo>
            )}
            {exerciseHasNoWeight(e) && <p className="muted tk-sub">Gewicht nach Gefühl</p>}
            {removing === e.rid && (
              <p className="tk-note">
                Die erledigten Sätze dieser Übung gehen dabei weg. Wirklich entfernen?{' '}
                <button type="button" onClick={() => { setRemoving(null); act((x) => removeExercise(x, e.rid)); }}>Ja, entfernen</button>{' '}
                <button type="button" className="ghost" onClick={() => setRemoving(null)}>Behalten</button>
              </p>
            )}
            {e.sets.length > 0 && <SetHead timed={timed} />}
            {e.sets.map((s, si) => (
              <SetRow key={s.rid} index={si} set={s} timed={timed} label={labels[si]} hint={setHint(s, before[si] ?? null, timed, range, si === firstWork)}
                plates={s.rid === plateRid ? plateLine(s.weightKg as number) : null}
                confirmedNow={() => store.current().exercises.find((x) => x.rid === e.rid)?.sets.find((x) => x.rid === s.rid)?.doneMs != null}
                onEdit={(patch) => act((x) => editSet(x, e.rid, s.rid, patch))}
                onToggle={() => act((x) => (s.doneMs === null ? confirmSet(x, e.rid, s.rid, now()) : unconfirmSet(x, e.rid, s.rid)))}
                onRemove={() => act((x) => removeSet(x, e.rid, s.rid))} />
            ))}
            {effortOn && asksEffort(w, e.rid, history, catalog) && (
              <EffortQuestion title={e.title} onAnswer={(a) => act((x) => setEffort(x, e.rid, a))}
                onOff={() => { setEffortOn(false); act((x) => setEffort(x, e.rid, 'skip')); }} />
            )}
            {e.effort && e.effort !== 'skip' && <p className="muted tk-sub">Noch möglich: {EFFORT_LABEL[e.effort]}</p>}
            <div className="tk-row">
              <button type="button" className="secondary" onClick={() => act((x) => addSet(x, e.rid))}>Satz hinzufügen</button>
            </div>
            <NotesField store={store} label={`Notiz zu ${e.title}`} value={e.notes} onCommit={(text) => act((x) => editNotes(x, e.rid, text))} />
          </section>
        );
      })}
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
          like={picker.mode === 'swap' ? w.exercises.find((x) => x.rid === picker.ex) : undefined}
          onPick={(ex: Exercise) => {
            const p = picker; setPicker(null);
            act((x) => (p.mode === 'swap' ? swapExercise(x, p.ex, ex, history) : addExercise(x, ex, history)));
          }} />
      )}
    </div>
  );
}

/** One exercise of the plan in a line: "Bankdrücken · 3 × 8 · 60 kg". Warm-ups are not counted. */
export function planLine(e: GymWorkout['exercises'][number]): string {
  const work = e.sets.filter((s) => s.type !== 'warmup');
  const reps = [...new Set(work.map((s) => (s.repRange ? `${s.repRange.start}–${s.repRange.end}` : s.reps)).filter((r) => r != null))];
  const kg = [...new Set(work.map((s) => s.weightKg).filter((w): w is number => w != null && w > 0))];
  const parts = [e.title];
  if (work.length > 0) parts.push(reps.length === 1 ? `${work.length} × ${reps[0]}` : `${work.length} Sätze`);
  if (kg.length === 1) parts.push(`${String(kg[0]).replace('.', ',')} kg`);
  return parts.join(' · ');
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

  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const logged = (workouts ?? []).filter((r) => !r.deleted).map((r) => r.body as LoggedWorkout);
  const studio = chosen ?? defaultStudio(logged);

  async function begin(w: TrackedWorkout) {
    if (starting.current) return; // a double tap makes one workout
    starting.current = true;
    try {
      const s = acquireStore(port, studio ? { ...w, studio } : w, now);
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
      <StudioLine value={studio} known={knownStudios(logged)} onChange={setChosen} />
      {plan && (
        <section className="card tk-plan-preview" aria-label="Heutiger Plan">
          <h2>{plan.name}</h2>
          <ul>{plan.exercises.map((e, i) => <li key={i}>{planLine(e)}</li>)}</ul>
          <button type="button" aria-label={`${plan.name} starten`} onClick={() => void startPlan(plan)}>Training starten</button>
        </section>
      )}
      {(routinesQ.records ?? []).map((r) => {
        const body = r.body as GymWorkout;
        return <button type="button" key={r.id} className="secondary" onClick={() => void startPlan(body)}>{body.name} starten</button>;
      })}
      <button type="button" className="ghost" onClick={() => void begin(startEmpty(now(), newId()))}>Leeres Training starten</button>
      <ExerciseProposals port={port} now={now} newId={newId} />
    </div>
  );
}
