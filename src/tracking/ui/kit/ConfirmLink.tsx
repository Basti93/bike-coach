import { useState } from 'react';

/** A destructive text link that needs a second tap: "Löschen" turns into "Wirklich löschen? Ja / Abbrechen". */
export function ConfirmLink({ label, question = 'Wirklich löschen?', onConfirm, disabled }: { label: string; question?: string; onConfirm: () => void; disabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="danger-link" disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="tk-confirm" role="group" aria-label={question}>
      <span>{question}</span>
      <button type="button" className="danger-link" onClick={() => { setAsking(false); onConfirm(); }}>Ja</button>
      <button type="button" className="link" onClick={() => setAsking(false)}>Abbrechen</button>
    </span>
  );
}
