import { useId } from 'react';

/** A row with the label left and the switch right; the whole row is the tap target. An optional one-line hint sits under the label. */
export function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="tk-switchrow">
      <span className="tk-switchtext">
        <span id={`${id}-l`}>{label}</span>
        {hint && <small id={`${id}-h`} className="muted">{hint}</small>}
      </span>
      <input type="checkbox" role="switch" aria-labelledby={`${id}-l`} aria-describedby={hint ? `${id}-h` : undefined}
        checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
