import { minuteChoices } from '../../shared/frame';
import type { Frame } from '../../shared/frame';

const parse = (v: string): number | null => (v === '' ? null : Number(v));

/** One compact line: how the week is planned and how long a session may take. */
export function PlanningLine({ frame, onMode, onMinutes }: { frame: Frame; onMode: (m: Frame['mode']) => void; onMinutes: (m: number | null) => void }) {
  return (
    <p className="tk-row tk-frame-line">
      <label>Planung <select aria-label="Planung" value={frame.mode} onChange={(e) => onMode(e.target.value as Frame['mode'])}>
        <option value="week">Feste Woche</option><option value="spontaneous">Spontan</option>
      </select></label>
      <span aria-hidden>·</span>
      <label>Zeit pro Einheit <select aria-label="Zeit pro Einheit" value={frame.minutes ?? ''} onChange={(e) => onMinutes(parse(e.target.value))}>
        <option value="">–</option>{minuteChoices().map((m) => <option key={m} value={m}>{m}</option>)}
      </select> Min</label>
    </p>
  );
}

/** "Heute nur [–|20|30|45|60] Min": a lower time for today only. */
export function TodayOnly({ frame, date, onChange }: { frame: Frame; date: string; onChange: (m: number | null) => void }) {
  const value = frame.today?.date === date ? frame.today.minutes : null;
  return (
    <label className="tk-today-only muted">Heute nur <select aria-label="Heute nur" value={value ?? ''} onChange={(e) => onChange(parse(e.target.value))}>
      <option value="">–</option>{minuteChoices().filter((m) => m <= 60).map((m) => <option key={m} value={m}>{m}</option>)}
    </select> Min</label>
  );
}
