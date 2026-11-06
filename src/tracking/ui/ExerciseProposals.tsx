import { useMemo, useState } from 'react';
import { mergeCatalog } from '../../shared/catalog';
import { EXERCISES, type Exercise } from '../../shared/exercises';
import { FEDB_EXERCISES } from '../../shared/fedb';
import type { TrackedRecord } from '../../shared/records';
import { isObj } from '../../shared/exercise-links';
import { changeProposal, confirmProposal, proposalOf, recentLinkOf, rejectProposal, relink, undoLink } from '../exercise-proposals';
import type { TrackingPort } from '../ports';
import { ExercisePicker } from './ExercisePicker';
import { usePortRecords } from './hooks';
import { EQUIPMENT, muscleLabel } from './labels';

/** What the coach sorted for the person: proposals to confirm or change, and recent links to change or take back. Nothing when there is nothing. */
export function ExerciseProposals({ port, now = Date.now, newId }: { port: TrackingPort; now?: () => number; newId?: () => string }) {
  const { records } = usePortRecords(port, 'exercise');
  const catalog = useMemo(() => mergeCatalog(EXERCISES, FEDB_EXERCISES, records ?? []), [records]);
  const [changing, setChanging] = useState<{ r: TrackedRecord; link: boolean } | null>(null);
  const [failed, setFailed] = useState(false);

  const proposals = (records ?? []).flatMap((r) => { const p = proposalOf(r); return p ? [{ r, p }] : []; })
    .filter(({ p }) => p.kind === 'new' || catalog.some((e) => e.id === p.targetId))
    .sort((a, b) => a.p.atMs - b.p.atMs);
  const links = (records ?? []).flatMap((r) => { const l = recentLinkOf(r, now()); return l && catalog.some((e) => e.id === l.targetId) ? [{ r, l }] : []; }).sort((a, b) => b.l.atMs - a.l.atMs);
  if (proposals.length === 0 && links.length === 0 && !changing) return null;

  // The stored records and catalog are read again just before writing, so a pick that just created an exercise is known.
  // The record a row stands on, as stored now. Gone or changed in the meantime: nothing is written.
  const current = (stored: TrackedRecord[], r: TrackedRecord): TrackedRecord | null => {
    const cur = stored.find((x) => x.id === r.id);
    return cur && JSON.stringify(proposalOf(cur)) === JSON.stringify(proposalOf(r)) && JSON.stringify(recentLinkOf(cur, now())) === JSON.stringify(recentLinkOf(r, now())) ? cur : null;
  };
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
                : <>Neue Übung: {isObj(r.body) && typeof r.body.title === 'string' ? r.body.title : p.forTitle}{isObj(r.body) && typeof r.body.primaryMuscle === 'string' ? `, ${muscleLabel(r.body.primaryMuscle)}` : ''}{isObj(r.body) && typeof r.body.equipment === 'string' ? `, ${EQUIPMENT[r.body.equipment] ?? r.body.equipment}` : ''}</>}
            </span>
            <span className="tk-proposal-actions">
              <button type="button" className="secondary" onClick={() => void write((stored, cat) => { const cur = current(stored, r); return cur ? confirmProposal(cur, cat, now(), stored) : []; })}>Bestätigen</button>
              <button type="button" className="ghost" onClick={() => setChanging({ r, link: false })}>Ändern</button>
              <button type="button" className="ghost" onClick={() => void write((stored) => { const cur = current(stored, r); return cur ? rejectProposal(cur, now()) : []; })}>Verwerfen</button>
            </span>
          </li>
        ))}
        {links.map(({ r, l }) => (
          <li key={r.id}>
            <span>‚{l.title}‘ als {title(l.targetId)} eingeordnet</span>
            <span className="tk-proposal-actions">
              <button type="button" className="ghost" onClick={() => setChanging({ r, link: true })}>Ändern</button>
              <button type="button" className="ghost" onClick={() => void write((stored) => { const cur = current(stored, r); return cur ? undoLink(cur, now()) : []; })}>Rückgängig</button>
            </span>
          </li>
        ))}
      </ul>
      {changing && (
        <ExercisePicker port={port} now={now} newId={newId} like={{ title: (changing.link ? recentLinkOf(changing.r, now())?.title : proposalOf(changing.r)?.forTitle) ?? '', exerciseId: '' }} onClose={() => setChanging(null)}
          onPick={(e) => { const { r, link } = changing; setChanging(null); void write((stored, cat) => { const cur = current(stored, r); return !cur ? [] : link ? relink(cur, e.id, cat, now()) : changeProposal(cur, e.id, cat, now(), stored); }); }} />
      )}
    </section>
  );
}
