import { useMemo, useState } from 'react';
import type { Exercise } from '../../shared/exercises';
import type { TrackingPort } from '../ports';
import { useCatalog } from './hooks';
import { EQUIPMENT, muscleLabel, MUSCLES, TYPES } from './labels';

export function ExercisePicker({ port, onPick, onClose, now = Date.now, newId = () => crypto.randomUUID() }: {
  port: TrackingPort; onPick: (e: Exercise) => void; onClose: () => void; now?: () => number; newId?: () => string;
}) {
  const catalog = useCatalog(port);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', muscle: '', equipment: '', type: '' });
  const [error, setError] = useState(false);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = catalog.filter((e) => !needle || e.title.toLowerCase().includes(needle) || muscleLabel(e.primaryMuscle).toLowerCase().includes(needle));
    const by = new Map<string, Exercise[]>();
    for (const e of hit) by.set(e.primaryMuscle, [...(by.get(e.primaryMuscle) ?? []), e]);
    return [...by.entries()].sort((a, b) => muscleLabel(a[0]).localeCompare(muscleLabel(b[0]), 'de'));
  }, [catalog, q]);

  const valid = draft.name.trim() !== '' && draft.muscle !== '' && draft.equipment !== '' && draft.type !== '';
  async function save() {
    const ex: Exercise = { id: newId(), title: draft.name.trim(), type: draft.type, primaryMuscle: draft.muscle, equipment: draft.equipment };
    try {
      await port.put({ kind: 'exercise', id: ex.id, updatedMs: now(), deleted: false, body: ex });
      onPick(ex);
    } catch { setError(true); }
  }

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
      {groups.map(([muscle, list]) => (
        <section key={muscle}>
          <h3>{muscleLabel(muscle)}</h3>
          <div className="tk-list">
            {list.map((e) => (
              <button type="button" key={e.id} className="tk-pick" onClick={() => onPick(e)}>
                {e.title}<small aria-hidden="true"> · {EQUIPMENT[e.equipment] ?? e.equipment}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
