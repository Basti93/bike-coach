type Note = { atMs: number; text: string; reply?: string };
type Change = { atMs: number; text: string };
type Entry = { atMs: number; who: 'Du' | 'Coach'; text: string; reply?: string };

const date = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

/** What you said and what the coach did in response, newest first. "Keine Änderung" says nothing. */
export const coachLog = (notes: Note[], changes: Change[]): Entry[] => [
  ...notes.map((n): Entry => ({ atMs: n.atMs, who: 'Du', text: n.text, ...(n.reply ? { reply: n.reply } : {}) })),
  ...changes.filter((c) => !/^keine änderung/i.test(c.text.trim())).map((c): Entry => ({ atMs: c.atMs, who: 'Coach', text: c.text })),
].sort((a, b) => b.atMs - a.atMs);

const Row = ({ e }: { e: Entry }) => (
  <li>
    <span className={e.who === 'Du' ? 'log-who you' : 'log-who'}>{e.who}</span>
    <span className="log-text">{e.text}{e.reply && <span className="reply">{e.reply}</span>}</span>
    <span className="muted log-date">{date(e.atMs)}</span>
  </li>
);

export const CoachLog = ({ notes, changes }: { notes: Note[]; changes: Change[] }) => {
  const entries = coachLog(notes, changes);
  if (!entries.length) return null;
  return (
    <details className="coach-log">
      <summary className="muted">Bisheriges Gespräch ({entries.length})</summary>
      <ul>{entries.map((e, i) => <Row key={i} e={e} />)}</ul>
    </details>
  );
};
