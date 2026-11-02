import { useMemo, useState } from 'react';
import type { LoggedWorkout } from '../../shared/records';
import type { TrackingPort } from '../ports';
import { editSet, formatDecimal, removeSet, type TrackedSet, type TrackedWorkout } from '../session';
import { createWorkoutStore } from '../store';
import { finishedWorkouts, usePortRecords, useStoreView, type WorkoutStore } from './hooks';
import { dateLabel } from './labels';
import { SetRow } from './SetRow';
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

function Detail({ store, history, onBack, onDeleted }: { store: WorkoutStore; history: LoggedWorkout[]; onBack: () => void; onDeleted: () => void }) {
  const { workout: w, save } = useStoreView(store);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const act = (fn: (x: TrackedWorkout) => TrackedWorkout) => void store.apply(fn);
  return (
    <div className="tk-screen">
      <div className="tk-row"><button type="button" className="ghost" onClick={onBack}>Zurück</button><h1 className="tk-title">{w.title}</h1></div>
      <p className="muted">{dateLabel(w.startMs)}</p>
      {save === 'unsaved' && <p role="status" className="tk-note">Gerade nicht gespeichert. Die Änderung bleibt hier und wird beim nächsten Schritt erneut gespeichert.</p>}
      {w.exercises.map((e, ei) => (
        <section key={ei} className="card tk-ex" aria-label={e.title}>
          <div className="tk-row">
            <h2>{e.title}</h2><span className="spacer" />
            <button type="button" className="ghost" aria-label={`Verlauf ${e.title}`} onClick={() => setProgress(progress === e.exerciseId ? null : e.exerciseId)}>Verlauf</button>
          </div>
          {progress === e.exerciseId && <Progress exerciseId={e.exerciseId} history={history} />}
          {e.sets.map((s, si) => (
            <SetRow key={si} index={si} set={s} timed={!!e.timed}
              onEdit={(patch) => act((x) => editSet(x, ei, si, patch))} onRemove={() => act((x) => removeSet(x, ei, si))} />
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

export function HistoryScreen({ port, now = Date.now }: { port: TrackingPort; now?: () => number; newId?: () => string }) {
  const records = usePortRecords(port, 'workout');
  const history = finishedWorkouts(records);
  const [store, setStore] = useState<WorkoutStore | null>(null);
  if (store) return <Detail store={store} history={history} onBack={() => setStore(null)} onDeleted={() => setStore(null)} />;
  return (
    <div className="tk-screen">
      <h1 className="tk-title">Verlauf</h1>
      <SyncNote port={port} />
      {records !== null && history.length === 0 && <p className="muted">Hier erscheinen deine abgeschlossenen Trainings.</p>}
      <div className="tk-list">
        {history.map((w) => (
          <button type="button" key={w.id} className="tk-pick" onClick={() => setStore(createWorkoutStore(port, w as TrackedWorkout, now))}>
            {w.title} · {dateLabel(w.endMs ?? w.startMs)}
            <small> · {w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.doneMs !== null).length, 0)} Sätze</small>
          </button>
        ))}
      </div>
    </div>
  );
}
