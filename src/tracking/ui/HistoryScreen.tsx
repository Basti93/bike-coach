import { useMemo, useState } from 'react';
import { dedupeSessions } from '../../shared/history';
import type { LoggedWorkout, TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import { editSet, formatDecimal, lastValues, removeSet, type TrackedSet, type TrackedWorkout } from '../session';
import { acquireStore, releaseStore } from '../registry';
import { useEffect } from 'react';
import type { Exercise } from '../../shared/exercises'; import { useCatalog, usePortRecords, useStoreView, type WorkoutStore } from './hooks';
import { dateLabel } from './labels';
import { SetHead, SetRow } from './SetRow';
import { setLabels } from './setGrid';
import { SyncNote } from './SyncNote';

const best = (sets: TrackedSet[], timed: boolean): TrackedSet | null =>
  sets.filter((s) => s.doneMs !== null).reduce<TrackedSet | null>((b, s) => {
    const v = (x: TrackedSet) => (timed ? x.durationS : x.weightKg) ?? 0;
    return !b || v(s) > v(b) ? s : b;
  }, null);
const describe = (s: TrackedSet, timed: boolean): string =>
  timed ? `${s.durationS ?? 0} Sek.` : `${s.weightKg !== null ? `${formatDecimal(s.weightKg)} kg` : 'nach Gefühl'}${s.reps !== null ? ` × ${s.reps}` : ''}`;

function Progress({ exerciseId, history }: { exerciseId: string; history: LoggedWorkout[] }) {
  const rows = useMemo(() => history.filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId)).sort((a, b) => (a.endMs ?? 0) - (b.endMs ?? 0)).map((w) => {
    const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets as TrackedSet[]);
    const timed = w.exercises.some((e) => e.exerciseId === exerciseId && (e as { timed?: boolean }).timed);
    const b = best(sets, timed);
    return b ? { id: w.id, end: w.endMs ?? 0, text: describe(b, timed), value: (timed ? b.durationS : b.weightKg) ?? 0 } : null;
  }).filter((r): r is NonNullable<typeof r> => r !== null), [exerciseId, history]);
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="muted">Noch keine erledigten Sätze.</p>;
  return (
    <ul className="tk-progress">
      {rows.map((r) => (
        <li key={r.id}><span>{dateLabel(r.end)}</span><span className="tk-bar" style={{ width: `${Math.max(6, (r.value / max) * 100)}%` }} /><span>{r.text}</span></li>
      ))}
    </ul>
  );
}

function Detail({ port, store, history, onBack, onDeleted }: { port: TrackingPort; store: WorkoutStore; history: LoggedWorkout[]; onBack: () => void; onDeleted: () => void }) {
  const { workout: w, save } = useStoreView(store);
  useEffect(() => () => releaseStore(port, store), [port, store]);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const act = (fn: (x: TrackedWorkout) => TrackedWorkout) => void store.apply(fn);
  return (
    <div className="tk-screen">
      <div className="tk-row"><button type="button" className="ghost" onClick={onBack}>Zurück</button><h1 className="tk-title">{w.title}</h1></div>
      <p className="muted">{dateLabel(w.startMs)}</p>
      {save === 'unsaved' && <p role="status" className="tk-note">Gerade nicht gespeichert. Die Änderung bleibt hier und wird beim nächsten Schritt erneut gespeichert.</p>}
      {w.exercises.map((e) => (
        <section key={e.rid} className="card tk-ex" aria-label={e.title}>
          <div className="tk-row">
            <h2>{e.title}</h2><span className="spacer" />
            <button type="button" className="ghost" aria-label={`Verlauf ${e.title}`} onClick={() => setProgress(progress === e.exerciseId ? null : e.exerciseId)}>Verlauf</button>
          </div>
          {progress === e.exerciseId && <Progress exerciseId={e.exerciseId} history={history} />}
          {e.sets.length > 0 && <SetHead timed={!!e.timed} />}
          {e.sets.map((s, si) => (
            <SetRow key={s.rid} index={si} set={s} timed={!!e.timed} label={setLabels(e.sets)[si]}
              confirmedNow={() => store.current().exercises.find((x) => x.rid === e.rid)?.sets.find((x) => x.rid === s.rid)?.doneMs != null}
              onEdit={(patch) => act((x) => editSet(x, e.rid, s.rid, patch))} onRemove={() => act((x) => removeSet(x, e.rid, s.rid))} />
          ))}
        </section>
      ))}
      {confirming ? (
        <p className="tk-note">
          Dieses Training wird gelöscht. Es lässt sich nicht zurückholen.{' '}
          <button type="button" onClick={() => void store.remove().then((ok) => { if (ok) onDeleted(); })}>Ja, löschen</button>{' '}
          <button type="button" className="ghost" onClick={() => setConfirming(false)}>Behalten</button>
        </p>
      ) : (
        <button type="button" className="ghost" onClick={() => setConfirming(true)}>Training löschen</button>
      )}
    </div>
  );
}

function ExerciseHistory({ exerciseId, title, history, catalog, onBack }: { exerciseId: string; title: string; history: LoggedWorkout[]; catalog: Exercise[]; onBack: () => void }) {
  const last = lastValues(exerciseId, history, catalog);
  const sessions = history.filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.doneMs !== null)));
  const timed = history.some((w) => w.exercises.some((e) => e.exerciseId === exerciseId && (e as { timed?: boolean }).timed));
  return (
    <div className="tk-screen">
      <div className="tk-row"><button type="button" className="ghost" onClick={onBack}>Zurück</button><h1 className="tk-title">{title}</h1></div>
      <section className="card">
        <h2>Zuletzt</h2>
        <p>{last.length ? last.map((s) => describe(s as TrackedSet, timed)).join(', ') : 'Noch keine erledigten Sätze.'}</p>
      </section>
      <section className="card"><h2>Verlauf</h2><Progress exerciseId={exerciseId} history={history} /></section>
      <section className="card">
        <h2>Trainings</h2>
        {sessions.map((w) => (
          <p key={w.id}>{dateLabel(w.endMs ?? w.startMs)}: {w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((s) => s.doneMs !== null)).map((s) => describe(s as TrackedSet, timed)).join(', ')}</p>
        ))}
      </section>
    </div>
  );
}

export function HistoryScreen({ port, now = Date.now }: { port: TrackingPort; now?: () => number; newId?: () => string }) {
  const q = usePortRecords(port, 'workout');
  const catalog = useCatalog(port);
  const records = q.records;
  // One performed session counts once: an overlapping Hevy copy of an own workout is left out.
  const history = dedupeSessions((records ?? []).map((r) => r.body as LoggedWorkout));
  const recOf = new Map((records ?? []).map((r) => [r.id, r] as [string, TrackedRecord]));
  const [store, setStore] = useState<WorkoutStore | null>(null);
  const [tab, setTab] = useState<'workouts' | 'exercises'>('workouts');
  const [exercise, setExercise] = useState<string | null>(null);

  if (store) return <Detail port={port} store={store} history={history} onBack={() => setStore(null)} onDeleted={() => setStore(null)} />;
  const exercises = new Map<string, string>();
  for (const w of history) for (const e of w.exercises) if (e.sets.some((s) => s.doneMs !== null) && !exercises.has(e.exerciseId)) exercises.set(e.exerciseId, e.title);
  if (exercise !== null) return <ExerciseHistory exerciseId={exercise} title={exercises.get(exercise) ?? ''} history={history} catalog={catalog} onBack={() => setExercise(null)} />;

  return (
    <div className="tk-screen">
      <h1 className="tk-title">Verlauf</h1>
      <SyncNote port={port} />
      {q.failed && <p role="status" className="tk-note">Der Verlauf konnte gerade nicht gelesen werden. <button type="button" onClick={q.retry}>Nochmal versuchen</button></p>}
      <div className="tk-tabs">
        <button type="button" className={tab === 'workouts' ? '' : 'secondary'} aria-pressed={tab === 'workouts'} onClick={() => setTab('workouts')}>Trainings</button>
        <button type="button" className={tab === 'exercises' ? '' : 'secondary'} aria-pressed={tab === 'exercises'} onClick={() => setTab('exercises')}>Übungen</button>
      </div>
      {records !== null && history.length === 0 && <p className="muted">Hier erscheinen deine abgeschlossenen Trainings.</p>}
      {tab === 'workouts' ? (
        <div className="tk-list">
          {history.map((w) => (
            <button type="button" key={w.id} className="tk-pick" onClick={() => setStore(acquireStore(port, recOf.get(w.id) ?? (w as TrackedWorkout), now))}>
              {w.title} · {dateLabel(w.endMs ?? w.startMs)}
              <small> · {w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.doneMs !== null).length, 0)} Sätze</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="tk-list">
          {[...exercises.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')).map(([id, title]) => (
            <button type="button" key={id} className="tk-pick" onClick={() => setExercise(id)}>{title}</button>
          ))}
        </div>
      )}
    </div>
  );
}
