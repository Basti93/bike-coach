import { useEffect, useRef, useState } from 'react';
import { chatThread, COACH_PREFS_ID, prefsOf, proposalAnswer, waitingMessage, MAX_CHAT_TEXT, type ChatEntry, type ChatMessage, type CoachPrefs } from '../../shared/chat';
import { HARDNESS_LABEL, mondayOf, planOfWeek, SPORT_LABEL, WEEKDAY_LABEL, addDays, type PlanDay, type WeekPlanBody, type WeekProposal } from '../../shared/week-plan';
import type { TrackingPort } from '../ports';
import { usePortRecords } from './hooks';
import { dayText as runDay, nextUpdatedMs, runView } from './run-view';
import type { PlannedRun } from '../../shared/run';

const localKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayName = (date: string) => WEEKDAY_LABEL[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]!;
const dayText = (d: PlanDay) => (d.sport === 'rest' ? 'Ruhetag' : `${SPORT_LABEL[d.sport]}, ${HARDNESS_LABEL[d.hardness]}${d.long ? ', lang' : ''}${d.sport === 'gym' && d.legs ? ', mit Beinen' : ''}`);
/** Waiting longer than this for an answer: say so calmly. */
const SLOW_MS = 3 * 60_000;
/** The coach no longer answers messages this old. */
const STALE_MS = 2 * 86_400_000;

const RUN_KIND: Record<string, string> = { easy: 'locker', long: 'lang', test: 'Test' };
const runText = (r: PlannedRun & { done?: unknown }) => `Lauf ${RUN_KIND[r.kind] ?? ''} · ${r.minutes} Min.${r.hrCap !== null ? ` · Puls bis ${r.hrCap}` : ''}${r.done != null ? ' · gelaufen' : ''}`;

function Week({ days, label, today, runs = [] }: { days: PlanDay[]; label: string; today?: string; runs?: PlannedRun[] }) {
  return (
    <ul className="tk-week" aria-label={label}>
      {days.map((d) => (
        <li key={d.date} className={d.date === today ? 'tk-today' : undefined} aria-current={d.date === today ? 'date' : undefined}>
          <b>{dayName(d.date)}</b> <span>{dayText(d)}</span>{d.fixed && <span className="muted"> · fest</span>}{d.note && <span className="muted"> · {d.note}</span>}
          {runs.filter((r) => r.date === d.date).map((r) => <span key={r.kind} className="tk-sub"> · {runText(r)}</span>)}
        </li>
      ))}
    </ul>
  );
}

function Proposal({ m, answer, onTake, onDecline }: { m: ChatEntry & { proposal: WeekProposal }; answer: 'taken' | 'declined' | null; onTake: () => void; onDecline: () => void }) {
  const p = m.proposal;
  return (
    <div className="tk-proposal">
      <Week days={p.days} label={`Vorschlag für die Woche ab ${dayName(p.weekStart)}, ${p.weekStart.slice(8, 10)}.${p.weekStart.slice(5, 7)}.`} />
      {m.warnings && m.warnings.length > 0 && <p className="tk-note">Mehr als unsere Regeln für Erholung empfehlen: {m.warnings.join(' ')}</p>}
      {answer === null ? (
        <div className="tk-row">
          <button type="button" onClick={onTake}>Übernehmen</button>
          <button type="button" className="ghost" onClick={onDecline}>Nein danke</button>
        </div>
      ) : <p className="muted">{answer === 'taken' ? 'Übernommen.' : 'Abgelehnt.'}</p>}
    </div>
  );
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

/** When the coach writes by itself. Both off until switched on; pushes need notifications allowed on this device. */
function PrefsCard({ prefs, onChange }: { prefs: CoachPrefs; onChange: (p: CoachPrefs) => void }) {
  const hourSelect = (label: string, value: number, set: (h: number) => void) => (
    <select aria-label={label} value={value} onChange={(e) => set(Number(e.target.value))}>{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
  );
  return (
    <details className="card tk-prefs">
      <summary>Wann sich der Coach meldet</summary>
      <label className="tk-row"><input type="checkbox" checked={prefs.week.on} onChange={(e) => onChange({ ...prefs, week: { ...prefs.week, on: e.target.checked } })} /> Wochengespräch mit Vorschlag für die nächste Woche</label>
      {prefs.week.on && (
        <div className="tk-row">
          <select aria-label="Tag des Wochengesprächs" value={prefs.week.day} onChange={(e) => onChange({ ...prefs, week: { ...prefs.week, day: Number(e.target.value) } })}>
            {WEEKDAY_LABEL.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          {hourSelect('Uhrzeit des Wochengesprächs', prefs.week.hour, (h) => onChange({ ...prefs, week: { ...prefs.week, hour: h } }))}
        </div>
      )}
      <label className="tk-row"><input type="checkbox" checked={prefs.evening.on} onChange={(e) => onChange({ ...prefs, evening: { ...prefs.evening, on: e.target.checked } })} /> Am Vorabend sagen, was morgen ansteht (nur vor Trainingstagen)</label>
      {prefs.evening.on && <div className="tk-row">{hourSelect('Uhrzeit am Vorabend', prefs.evening.hour, (h) => onChange({ ...prefs, evening: { ...prefs.evening, hour: h } }))}</div>}
      <p className="muted">Kommt als Mitteilung, wenn sie auf diesem Gerät erlaubt sind, und steht immer hier im Chat.</p>
    </details>
  );
}

/** One chat with the coach for all sports, with the week plan on top. Proposals change nothing until the rider takes them. */
export function CoachScreen({ port, now, newId }: { port: TrackingPort; now: () => number; newId: () => string }) {
  const chat = usePortRecords(port, 'chat').all;
  const plans = usePortRecords(port, 'weekplan').all;
  const runRecords = usePortRecords(port, 'run').all;
  const complaintRecords = usePortRecords(port, 'complaint').all;
  const prefRecords = usePortRecords(port, 'coachprefs').all;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const thread = chatThread(chat ?? []);
  const complaints = (complaintRecords ?? []).flatMap((r) => {
    const b = r.body as { text?: unknown; status?: unknown } | null;
    return !r.deleted && b && typeof b.text === 'string' && b.status !== 'over' ? [b.text] : [];
  });
  const waiting = waitingMessage(thread);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [thread.length]);

  const today = localKey(now());
  const monday = mondayOf(today);
  const current = planOfWeek(plans ?? [], monday);
  const next = planOfWeek(plans ?? [], addDays(monday, 7));
  // The run coach's runs sit on their days; without a week plan they are listed on their own.
  const runWeek = runView(runRecords ?? [], now()).week;
  const runs = runWeek?.runs ?? [];

  const write = async (m: ChatMessage) => {
    setError(null);
    try { await port.put({ kind: 'chat', id: newId(), updatedMs: now(), deleted: false, body: m }); return true; } catch { setError('Konnte nicht gespeichert werden. Versuch es gleich nochmal.'); return false; }
  };
  const send = async () => {
    const t = text.trim().slice(0, MAX_CHAT_TEXT);
    if (!t) return;
    if (await write({ role: 'rider', text: t, atMs: now() })) setText('');
  };
  const take = async (m: ChatEntry & { proposal: WeekProposal }) => {
    const have = (plans ?? []).find((r) => r.kind === 'weekplan' && r.id === m.proposal.weekStart);
    const body: WeekPlanBody = { ...m.proposal, fromMessage: m.id, acceptedMs: now() };
    try {
      await port.put({ kind: 'weekplan', id: m.proposal.weekStart, updatedMs: nextUpdatedMs(now(), have), deleted: false, body });
      await write({ role: 'rider', text: 'Übernommen.', atMs: now(), takes: m.id });
    } catch { setError('Der Plan konnte nicht gespeichert werden. Versuch es gleich nochmal.'); }
  };
  const savePrefs = (p: CoachPrefs) => {
    const have = (prefRecords ?? []).find((r) => r.id === COACH_PREFS_ID);
    void port.put({ kind: 'coachprefs', id: COACH_PREFS_ID, updatedMs: nextUpdatedMs(now(), have), deleted: false, body: p }).catch(() => setError('Die Einstellung konnte nicht gespeichert werden.'));
  };
  const decline = (m: ChatEntry) => void write({ role: 'rider', text: 'Nein danke.', atMs: now(), declines: m.id });

  return (
    <div className="tk-screen tk-coach">
      <h1 className="tk-title">Woche</h1>
      {complaints.length > 0 && <p className="muted">Der Coach nimmt Rücksicht auf: {complaints.join(', ')}. Schreib ihm, wenn es wieder gut ist.</p>}
      <section className="card" aria-label="Wochenplan">
        <h2>Diese Woche</h2>
        {current ? <Week days={current.days} label="Wochenplan diese Woche" today={today} runs={runs} /> : <p className="muted">Noch kein Wochenplan. Schreib dem Coach, wie deine Woche aussehen soll, oder lass dir einen vorschlagen.</p>}
        {!current && runs.length > 0 && (
          <ul className="tk-week" aria-label="Läufe diese Woche">
            {runs.map((r) => <li key={r.date + r.kind}><b>{runDay(r.date)}</b> <span>{runText(r)}</span></li>)}
          </ul>
        )}
        {next && <><h2>Nächste Woche</h2><Week days={next.days} label="Wochenplan nächste Woche" runs={runs} /></>}
      </section>
      <section className="card tk-chat" aria-label="Unterhaltung mit dem Coach">
        {thread.length === 0 && <p className="muted">Zum Beispiel: „4 Tage diese Woche, Freitag bin ich sicher im Studio“ oder „Schlag mir eine Woche vor“.</p>}
        {thread.map((m) => (m.takes || m.declines ? null : (
          <div key={m.id} className={`tk-msg tk-msg-${m.role}`}>
            <p className="muted tk-sub">{m.role === 'rider' ? 'Du' : 'Coach'}</p>
            <p>{m.text}</p>
            {m.proposal && <Proposal m={m as ChatEntry & { proposal: WeekProposal }} answer={proposalAnswer(thread, m.id)} onTake={() => void take(m as ChatEntry & { proposal: WeekProposal })} onDecline={() => decline(m)} />}
          </div>
        )))}
        {waiting && <p role="status" className="muted">{now() - waiting.atMs > STALE_MS ? 'Darauf kam keine Antwort mehr. Schreib gern nochmal.' : now() - waiting.atMs > SLOW_MS ? 'Der Coach antwortet, sobald er wieder erreichbar ist.' : 'Der Coach denkt nach …'}</p>}
        <div ref={endRef} />
      </section>
      {error && <p role="alert" className="tk-note">{error}</p>}
      <form className="tk-row tk-chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <textarea aria-label="Nachricht an den Coach" rows={2} value={text} maxLength={MAX_CHAT_TEXT} onChange={(e) => setText(e.target.value)} placeholder="Nachricht an den Coach" />
        <button type="submit" disabled={!text.trim()}>Senden</button>
      </form>
      <PrefsCard prefs={prefsOf(prefRecords ?? [])} onChange={savePrefs} />
    </div>
  );
}
