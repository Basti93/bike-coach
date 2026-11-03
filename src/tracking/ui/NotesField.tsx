import { useEffect } from 'react';
import { useDraft, type WorkoutStore } from './hooks';

/** Notes keep what is typed locally and save shortly after typing stops and on leaving the field. */
export function NotesField({ label, value, onCommit, store }: { label: string; value: string; onCommit: (text: string) => void; store?: WorkoutStore }) {
  const d = useDraft(value, onCommit, 400);
  useEffect(() => store?.registerDraft({ pending: d.pending, flush: d.flush }), [store]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input className="tk-notes" aria-label={label} placeholder="Notiz" value={d.draft} onFocus={d.onFocus} onBlur={d.onBlur} onChange={(e) => d.onChange(e.target.value)} />;
}
