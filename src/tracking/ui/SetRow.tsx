import { useState } from 'react';
import { formatDecimal, parseDecimal, type TrackedSet } from '../session';
import { useDraft } from './hooks';

const invalidOf = (text: string, integer: boolean): boolean => {
  const n = parseDecimal(text);
  return n === undefined || (integer && n !== null && !Number.isInteger(n));
};

function NumField({ label, value, placeholder, integer, onCommit, onValidity }: {
  label: string; value: number | null; placeholder: string; integer?: boolean; onCommit: (n: number | null) => void; onValidity: (invalid: boolean) => void;
}) {
  const d = useDraft(formatDecimal(value), (text) => {
    const bad = invalidOf(text, !!integer);
    onValidity(bad);
    if (!bad) onCommit(parseDecimal(text) as number | null);
  });
  const bad = invalidOf(d.draft, !!integer);
  return (
    <span className="tk-field-wrap">
      <input
        className="tk-num" aria-label={label} placeholder={placeholder} inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off"
        aria-invalid={bad} value={d.draft} onFocus={d.onFocus}
        onBlur={() => { d.onBlur(); if (!bad) d.setDraft(formatDecimal(parseDecimal(d.draft) as number | null)); }}
        onChange={(e) => { onValidity(invalidOf(e.target.value, !!integer)); d.onChange(e.target.value); }}
      />
      {bad && <small className="tk-invalid" role="note">{integer ? 'Bitte eine ganze Zahl' : 'Bitte eine Zahl'}</small>}
    </span>
  );
}

const TYPE_LABEL = { normal: 'Satz', warmup: 'Aufwärmen', failure: 'Bis zum Versagen', dropset: 'Dropset' } as const;

export function SetRow({ index, set, timed, onEdit, onToggle, onRemove }: {
  index: number; set: TrackedSet; timed: boolean;
  onEdit: (patch: Partial<Pick<TrackedSet, 'weightKg' | 'reps' | 'durationS' | 'type'>>) => void;
  onToggle?: () => void; onRemove: () => void;
}) {
  const n = index + 1;
  const done = set.doneMs !== null;
  const [bad, setBad] = useState({ w: false, r: false });
  const [asking, setAsking] = useState(false);
  const blocked = bad.w || bad.r;
  return (
    <div className={`tk-set${done ? ' tk-done' : ''}`}>
      <select className="tk-type" aria-label={`Satztyp Satz ${n}`} value={set.type} onChange={(e) => onEdit({ type: e.target.value as TrackedSet['type'] })}>
        {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{v === 'normal' ? String(n) : l}</option>)}
      </select>
      {!timed && <NumField label={`Gewicht Satz ${n}`} value={set.weightKg} placeholder="nach Gefühl" onValidity={(w) => setBad((b) => ({ ...b, w }))} onCommit={(weightKg) => onEdit({ weightKg })} />}
      {timed
        ? <NumField label={`Sekunden Satz ${n}`} value={set.durationS} placeholder="Sek." integer onValidity={(r) => setBad((b) => ({ ...b, r }))} onCommit={(durationS) => onEdit({ durationS })} />
        : <NumField label={`Wiederholungen Satz ${n}`} value={set.reps} placeholder="Wdh." integer onValidity={(r) => setBad((b) => ({ ...b, r }))} onCommit={(reps) => onEdit({ reps })} />}
      {set.repRange && <span className="tk-range muted">{set.repRange.start}–{set.repRange.end}</span>}
      {onToggle && <button type="button" className={`tk-check${done ? ' on' : ''}`} aria-label={`Satz ${n} erledigt`} aria-pressed={done} disabled={blocked && !done} onClick={onToggle}>{done ? '✓' : ''}</button>}
      <button type="button" className="tk-icon ghost" aria-label={`Satz ${n} entfernen`} onClick={() => (done ? setAsking(true) : onRemove())}>×</button>
      {asking && (
        <p className="tk-note tk-wide">
          Dieser erledigte Satz geht dabei weg. Wirklich entfernen?{' '}
          <button type="button" onClick={() => { setAsking(false); onRemove(); }}>Ja, entfernen</button>{' '}
          <button type="button" className="ghost" onClick={() => setAsking(false)}>Behalten</button>
        </p>
      )}
    </div>
  );
}
