import { useDraft } from './hooks';

/** Notes keep what is typed locally and save shortly after typing stops and on leaving the field. */
export function NotesField({ label, value, onCommit }: { label: string; value: string; onCommit: (text: string) => void }) {
  const d = useDraft(value, onCommit, 400);
  return <input className="tk-notes" aria-label={label} placeholder="Notiz" value={d.draft} onFocus={d.onFocus} onBlur={d.onBlur} onChange={(e) => d.onChange(e.target.value)} />;
}
