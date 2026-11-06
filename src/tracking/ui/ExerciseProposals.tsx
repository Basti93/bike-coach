import { useMemo, useState } from 'react';
import { mergeCatalog } from '../../shared/catalog';
import { EXERCISES, type Exercise } from '../../shared/exercises';
import { FEDB_EXERCISES } from '../../shared/fedb';
import type { TrackedRecord } from '../../shared/records';
import { autoLinkOf, changeProposal, confirmProposal, proposalOf, undoAutoLink } from '../exercise-proposals';
import type { TrackingPort } from '../ports';
import { ExercisePicker } from './ExercisePicker';
import { usePortRecords } from './hooks';
import { muscleLabel } from './labels';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** What the coach sorted for the person: proposals to confirm or change, and recent auto links to take back. Nothing when there is nothing. */
export function ExerciseProposals({ port, now = Date.now, newId }: { port: TrackingPort; now?: () => number; newId?: () => string }) {
  const { records } = usePortRecords(port, 'exercise');
  const catalog = useMemo(() => mergeCatalog(EXERCISES, FEDB_EXERCISES, records ?? []), [records]);
  const [changing, setChanging] = useState<TrackedRecord | null>(null);
  const [failed, setFailed] = useState(false);

  const proposals = (records ?? []).flatMap((r) => { const p = proposalOf(r); return p ? [{ r, p }] : []; })
    .filter(({ p }) => p.kind === 'new' || catalog.some((e) => e.id === p.targetId))
    .sort((a, b) => a.p.atMs - b.p.atMs);
  const links = (records ?? []).flatMap((r) => { const l = autoLinkOf(r, now()); return l ? [{ r, l }] : []; }).sort((a, b) => b.l.atMs - a.l.atMs);
  if (proposals.length === 0 && links.length === 0 && !changing) return null;

  // The stored records and catalog are read again just before writing, so a pick that just created an exercise is known.
  async function write(make: (stored: TrackedRecord[], cat: Exercise[]) => TrackedRecord[]) {
    try {
      const stored = await port.list('exercise');
      const cat = mergeCatalog(EXERCISES, FEDB_EXERCISES, stored);
      for (const rec of make(stored, cat)) await port.put(rec);
      setFailed(false);
    } catch { setFailed(true); }
  }
  const title = (id: string | undefined) => catalog.find((e) => e.id === id)?.title ?? '';

  return (
    <section className="tk-proposals" aria-label="Übungen einordnen">
      <h3>Übungen einordnen</h3>
      {failed && <p role="status" className="tk-note">Gerade nicht gespeichert. Versuch es gleich nochmal.</p>}
      <ul className="tk-proposal-list">
        {proposals.map(({ r, p }) => (
          <li key={r.id}>
            <span>
              {p.kind === 'same'
                ? <>‚{p.forTitle}‘ ist vermutlich {title(p.targetId)}</>
                : <>Neue Übung: {isObj(r.body) && typeof r.body.title === 'string' ? r.body.title : p.forTitle}{isObj(r.body) && typeof r.body.primaryMuscle === 'string' ? `, ${muscleLabel(r.body.primaryMuscle)}` : ''}</>}
            </span>
            <span className="tk-proposal-actions">
              <button type="button" className="secondary" onClick={() => void write((stored, cat) => confirmProposal(r, cat, now(), stored))}>Bestätigen</button>
              <button type="button" className="ghost" onClick={() => setChanging(r)}>Ändern</button>
            </span>
          </li>
        ))}
        {links.map(({ r, l }) => (
          <li key={r.id}>
            <span>‚{l.title}‘ als {title(r.id)} eingeordnet</span>
            <span className="tk-proposal-actions">
              <button type="button" className="ghost" onClick={() => void write((stored) => undoAutoLink(stored.find((x) => x.id === r.id) ?? r, now()))}>Rückgängig</button>
            </span>
          </li>
        ))}
      </ul>
      {changing && (
        <ExercisePicker port={port} now={now} newId={newId} like={{ title: proposalOf(changing)?.forTitle ?? '', exerciseId: '' }} onClose={() => setChanging(null)}
          onPick={(e) => { const p = changing; setChanging(null); void write((stored, cat) => changeProposal(p, e.id, cat, now(), stored)); }} />
      )}
    </section>
  );
}
