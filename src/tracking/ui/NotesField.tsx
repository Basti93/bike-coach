import { useEffect, useLayoutEffect, useRef } from 'react';
import { useDraft, type WorkoutStore } from './hooks';

/** Notes keep what is typed locally and save shortly after typing stops and on leaving the field. Full width, grows with the text. */
export function NotesField({ label, value, onCommit, store }: { label: string; value: string; onCommit: (text: string) => void; store?: WorkoutStore }) {
  const d = useDraft(value, onCommit, 400);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => store?.registerDraft({ pending: d.pending, flush: d.flush }), [store]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + 2}px`;
  }, [d.draft]);
  return <textarea ref={ref} rows={1} className="tk-notes" aria-label={label} placeholder="Notiz" value={d.draft} onFocus={d.onFocus} onBlur={d.onBlur} onChange={(e) => d.onChange(e.target.value)} />;
}
