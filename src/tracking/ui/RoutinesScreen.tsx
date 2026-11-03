import { useRef, useState } from 'react';
import type { GymExercise, GymWorkout } from '../../coach/gym/types';
import type { TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import { ExercisePicker } from './ExercisePicker';
import { usePortRecords } from './hooks';

type Draft = { id: string; isNew: boolean; name: string; exercises: GymExercise[]; updatedMs: number };
/** Always newer than the stored copy, whatever the clock says, so the last edit wins. */
const after = (now: () => number, prev: number): number => Math.max(now(), prev + 1);
const emptySet = () => ({ type: 'normal' as const, weightKg: null, reps: null });

export function RoutinesScreen({ port, onStart, now = Date.now, newId = () => crypto.randomUUID() }: {
  port: TrackingPort; onStart: (r: GymWorkout) => void; now?: () => number; newId?: () => string;
}) {
  const q = usePortRecords(port, 'routine');
  const records = q.records;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const write = async (r: TrackedRecord): Promise<boolean> => { try { await port.put(r); setFailed(false); return true; } catch { setFailed(true); return false; } };

  if (draft) {
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    const setEx = (i: number, f: (e: GymExercise) => GymExercise | null) =>
      set({ exercises: draft.exercises.flatMap((e, k) => (k === i ? (f(e) ? [f(e)!] : []) : [e])) });
    return (
      <div className="tk-screen">
        <h1 className="tk-title">{draft.isNew ? 'Neue Routine' : 'Routine bearbeiten'}</h1>
        <label className="tk-field">Name der Routine<input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
        {draft.exercises.map((e, i) => (
          <div key={i} className="card tk-row">
            <strong>{e.title}</strong><span className="muted">{e.sets.length} Sätze</span><span className="spacer" />
            <button type="button" className="secondary" aria-label={`Satz entfernen ${e.title}`} disabled={e.sets.length <= 1} onClick={() => setEx(i, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}>−</button>
            <button type="button" className="secondary" aria-label={`Satz hinzufügen ${e.title}`} onClick={() => setEx(i, (x) => ({ ...x, sets: [...x.sets, emptySet()] }))}>+</button>
            <button type="button" className="ghost" aria-label={`Übung entfernen ${e.title}`} onClick={() => setEx(i, () => null)}>Entfernen</button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setPicking(true)}>Übung hinzufügen</button>
        {failed && <p role="status" className="tk-note">Gerade nicht gespeichert. Die Routine bleibt hier offen, versuch es gleich nochmal.</p>}
        <div className="tk-row">
          <button type="button" disabled={draft.name.trim() === ''} onClick={async () => {
            if (saving.current) return; // a double tap saves once
            saving.current = true;
            try {
              const body: GymWorkout = { name: draft.name.trim(), exercises: draft.exercises };
              if (await write({ kind: 'routine', id: draft.id, updatedMs: after(now, draft.updatedMs), deleted: false, body })) setDraft(null);
            } finally { saving.current = false; }
          }}>Routine speichern</button>
          <button type="button" className="ghost" onClick={() => { setDraft(null); setFailed(false); }}>Abbrechen</button>
        </div>
        {picking && <ExercisePicker port={port} now={now} newId={newId} onClose={() => setPicking(false)} onPick={(ex) => {
          setPicking(false);
          set({ exercises: [...draft.exercises, { templateId: ex.id, title: ex.title, restS: null, supersetId: null, notes: '', sets: [emptySet(), emptySet(), emptySet()] }] });
        }} />}
      </div>
    );
  }

  return (
    <div className="tk-screen">
      <h1 className="tk-title">Routinen</h1>
      {q.failed && <p role="status" className="tk-note">Deine Routinen konnten gerade nicht gelesen werden. <button type="button" onClick={q.retry}>Nochmal versuchen</button></p>}
      {records !== null && records.length === 0 && <p className="muted">Noch keine Routine. Leg eine an, dann startest du sie mit einem Tipp.</p>}
      {(records ?? []).map((r) => {
        const body = r.body as GymWorkout;
        return (
          <div key={r.id} className="card">
            <div className="tk-row">
              <h2>{body.name}</h2><span className="muted">{body.exercises.length} Übungen</span><span className="spacer" />
              <button type="button" aria-label={`${body.name} starten`} onClick={() => onStart(body)}>Starten</button>
              <button type="button" className="secondary" aria-label={`${body.name} bearbeiten`} onClick={() => setDraft({ id: r.id, isNew: false, name: body.name, exercises: body.exercises, updatedMs: r.updatedMs })}>Bearbeiten</button>
              <button type="button" className="ghost" aria-label={`${body.name} löschen`} onClick={() => setDeleting(r.id)}>Löschen</button>
            </div>
            {deleting === r.id && (
              <p className="tk-note">Routine löschen?{' '}
                <button type="button" onClick={async () => { await write({ ...r, updatedMs: after(now, r.updatedMs), deleted: true }); setDeleting(null); }}>Ja, löschen</button>{' '}
                <button type="button" className="ghost" onClick={() => setDeleting(null)}>Behalten</button>
              </p>
            )}
          </div>
        );
      })}
      {failed && <p role="status" className="tk-note">Gerade nicht gespeichert. Versuch es gleich nochmal.</p>}
      <button type="button" onClick={() => setDraft({ id: newId(), isNew: true, name: '', exercises: [], updatedMs: 0 })}>Neue Routine</button>
    </div>
  );
}
