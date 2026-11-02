import { useEffect, useState } from 'react';
import { formatDecimal, parseDecimal, type TrackedSet } from '../session';

function NumField({ label, value, placeholder, integer, onCommit }: { label: string; value: number | null; placeholder: string; integer?: boolean; onCommit: (n: number | null) => void }) {
  const [draft, setDraft] = useState(formatDecimal(value));
  useEffect(() => { if (parseDecimal(draft) !== value) setDraft(formatDecimal(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className="tk-num" aria-label={label} placeholder={placeholder} inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off" value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseDecimal(e.target.value);
        if (n !== undefined) onCommit(n === null || !integer ? n : Math.round(n));
      }}
    />
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
  return (
    <div className={`tk-set${done ? ' tk-done' : ''}`}>
      <select className="tk-type" aria-label={`Satztyp Satz ${n}`} value={set.type} onChange={(e) => onEdit({ type: e.target.value as TrackedSet['type'] })}>
        {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{v === 'normal' ? String(n) : l}</option>)}
      </select>
      {!timed && <NumField label={`Gewicht Satz ${n}`} value={set.weightKg} placeholder="nach Gefühl" onCommit={(weightKg) => onEdit({ weightKg })} />}
      {timed
        ? <NumField label={`Sekunden Satz ${n}`} value={set.durationS} placeholder="Sek." integer onCommit={(durationS) => onEdit({ durationS })} />
        : <NumField label={`Wiederholungen Satz ${n}`} value={set.reps} placeholder="Wdh." integer onCommit={(reps) => onEdit({ reps })} />}
      {set.repRange && <span className="tk-range muted">{set.repRange.start}–{set.repRange.end}</span>}
      {onToggle && <button type="button" className={`tk-check${done ? ' on' : ''}`} aria-label={`Satz ${n} erledigt`} aria-pressed={done} onClick={onToggle}>{done ? '✓' : ''}</button>}
      <button type="button" className="tk-icon ghost" aria-label={`Satz ${n} entfernen`} onClick={onRemove}>×</button>
    </div>
  );
}
