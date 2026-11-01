import { useState } from 'react';
import type { ClientMessage } from '../../shared/protocol';

/** The report stays on this Mac; the user decides what happens with it. */
export const ProblemReport = ({ send, reportPath }: { send: (m: ClientMessage) => void; reportPath: string | null }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  if (!open) return <button className="status-report" onClick={() => { setOpen(true); setSent(false); setNote(''); }}>Problem melden</button>;
  return (
    <div className="overlay">
      <div role="dialog" className="card dialog">
        <h2>Problem melden</h2>
        {sent && reportPath
          ? <p>Der Bericht bleibt auf diesem Mac und liegt hier: <code>{reportPath}</code></p>
          : <>
            <label>Was ist passiert?<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></label>
            <p className="muted">Der Bericht enthält die Verbindungen, Rohdaten der Geräte und deine Fahrtwerte der letzten drei Tage. Er wird nur gespeichert und nirgends hingeschickt.</p>
          </>}
        <div className="row">
          {!sent && <button onClick={() => { setSent(true); send({ type: 'problem-report', note }); }}>Bericht speichern</button>}
          <button className="secondary" onClick={() => setOpen(false)}>Schließen</button>
        </div>
      </div>
    </div>
  );
};
