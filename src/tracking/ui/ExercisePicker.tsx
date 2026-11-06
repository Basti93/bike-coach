import { useMemo, useState } from 'react';
import { exerciseDescription } from '../../shared/exercise-descriptions';
import type { Exercise } from '../../shared/exercises';
import { muscleGroupOf } from '../../shared/muscle-targets';
import { exerciseImages, videoSearchUrl } from '../media';
import type { TrackingPort } from '../ports';
import { ExerciseInfo } from './ExerciseInfo';
import { MuscleIcon } from './MuscleIcon';
import { matchesSearch, similarExercises } from '../similar';
import { useCatalog } from './hooks';
import { EQUIPMENT, muscleLabel, MUSCLES, TYPES } from './labels';

/** `like` is the exercise being swapped; similar ones then come first. */
export function ExercisePicker({ port, onPick, onClose, like, now = Date.now, newId = () => crypto.randomUUID() }: {
  port: TrackingPort; onPick: (e: Exercise) => void; onClose: () => void; like?: { title: string; exerciseId: string };
  now?: () => number; newId?: () => string;
}) {
  const catalog = useCatalog(port);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', muscle: '', equipment: '', type: '' });
  const [error, setError] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = catalog.filter((e) => matchesSearch(e, needle));
    const by = new Map<string, Exercise[]>();
    for (const e of hit) by.set(e.primaryMuscle, [...(by.get(e.primaryMuscle) ?? []), e]);
    return [...by.entries()].sort((a, b) => muscleLabel(a[0]).localeCompare(muscleLabel(b[0]), 'de'));
  }, [catalog, q]);
  const similar = useMemo(() => (like && !q.trim() ? similarExercises(like, catalog).slice(0, 8) : []), [like, catalog, q]);

  const valid = draft.name.trim() !== '' && draft.muscle !== '' && draft.equipment !== '' && draft.type !== '';
  async function save() {
    const ex: Exercise = { id: newId(), title: draft.name.trim(), type: draft.type, primaryMuscle: draft.muscle, equipment: draft.equipment };
    try {
      await port.put({ kind: 'exercise', id: ex.id, updatedMs: now(), deleted: false, body: ex });
      onPick(ex);
    } catch { setError(true); }
  }

  const item = (e: Exercise) => {
    const icon = <MuscleIcon group={muscleGroupOf(e)} />;
    return (
      <div key={e.id} className="tk-pick-item">
        <div className="tk-pick-row">
          <span className="tk-pick-icon">{icon}</span>
          <button type="button" className="tk-pick" onClick={() => onPick(e)}>
            {e.title}<small aria-hidden="true"> · {EQUIPMENT[e.equipment] ?? e.equipment}</small>
          </button>
          <button type="button" className="ghost tk-info-toggle" aria-label={`Ausführung ${e.title}`} aria-expanded={info === e.id}
            onClick={() => setInfo(info === e.id ? null : e.id)}>i</button>
        </div>
        {info === e.id && (
          <ExerciseInfo title={e.title} description={e.description ? { text: e.description, source: { kind: 'own' } } : exerciseDescription(e.id)} images={exerciseImages(e.id)} video={videoSearchUrl(e)} icon={icon} />
        )}
      </div>
    );
  };

  return (
    <div className="tk-picker" role="dialog" aria-label="Übung wählen">
      <div className="tk-row">
        <input className="tk-search" aria-label="Suchen" placeholder="Übung oder Muskel suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="ghost" onClick={onClose}>Schließen</button>
      </div>
      {creating ? (
        <form className="tk-form" onSubmit={(e) => { e.preventDefault(); if (valid) void save(); }}>
          <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>Muskelgruppe
            <select value={draft.muscle} onChange={(e) => setDraft({ ...draft, muscle: e.target.value })}>
              <option value="">Bitte wählen</option>{Object.entries(MUSCLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Equipment
            <select value={draft.equipment} onChange={(e) => setDraft({ ...draft, equipment: e.target.value })}>
              <option value="">Bitte wählen</option>{Object.entries(EQUIPMENT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Art
            <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="">Bitte wählen</option>{Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {error && <p role="status" className="tk-note">Konnte gerade nicht gespeichert werden. Versuch es gleich nochmal.</p>}
          <div className="tk-row">
            <button type="submit" disabled={!valid}>Übung speichern</button>
            <button type="button" className="ghost" onClick={() => setCreating(false)}>Abbrechen</button>
          </div>
        </form>
      ) : (
        <button type="button" className="secondary" onClick={() => setCreating(true)}>Eigene Übung anlegen</button>
      )}
      {groups.length === 0 && <p className="muted">Nichts gefunden. Du kannst eine eigene Übung anlegen.</p>}
      {similar.length > 0 && (
        <section aria-label="Ähnliche Übungen">
          <h3>Ähnlich wie {like!.title}</h3>
          <div className="tk-list">{similar.map(item)}</div>
        </section>
      )}
      {groups.map(([muscle, list]) => (
        <section key={muscle}>
          <h3>{muscleLabel(muscle)}</h3>
          <div className="tk-list">{list.map(item)}</div>
        </section>
      ))}
    </div>
  );
}
