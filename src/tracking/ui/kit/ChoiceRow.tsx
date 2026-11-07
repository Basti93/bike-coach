import { useState } from 'react';
import { Sheet } from './Sheet';

/** "Label — Wert ›": a row that opens a small sheet with the options; choosing one closes it. */
export function ChoiceRow<T extends string | number>({ label, value, options, onChange, placeholder = '' }: { label: string; value: T; placeholder?: string; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button type="button" className="tk-rowbtn tk-choice" onClick={() => setOpen(true)}>
        <span className="tk-row-title">{label}</span>
        <span className="tk-row-value muted">{current?.label ?? placeholder}</span>
        <span className="tk-chevron" aria-hidden="true">›</span>
      </button>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <ul className="tk-rows">
            {options.map((o) => (
              <li key={String(o.value)} className="tk-rowitem">
                <button type="button" className="tk-rowbtn" aria-pressed={o.value === value} onClick={() => { onChange(o.value); setOpen(false); }}>
                  <span className="tk-row-title">{o.label}</span>
                  {o.value === value && <span className="tk-row-value" aria-hidden="true">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
