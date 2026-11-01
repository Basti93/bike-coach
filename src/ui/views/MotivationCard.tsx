import { useState, type ReactNode } from 'react';
import { motivationOverview, nextQuestion, ruleEncouragement, type ComplaintStatus } from '../../coach/motivation';
import type { CoachState } from '../../coach/state';
import type { CoachClientMessage } from '../../shared/coach-protocol';

const STATUS: Record<ComplaintStatus, string> = { active: 'aktuell', healing: 'heilt, noch unsicher', over: 'vorbei' };

/** A few words and what you have achieved, just above the next session. */
export const Encouragement = ({ state, children }: { state: CoachState; children?: ReactNode }) => {
  const now = Date.now();
  const open = (state.complaints ?? []).some((c) => c.status !== 'over');
  const overview = motivationOverview(state.summaries, now);
  return (
    <section className="encouragement">
      <span className="encouragement-from">Dein Coach</span>
      <p className="motivation-words">{state.encouragement ?? ruleEncouragement(state.summaries, now, open)}</p>
      {overview.rides > 0 && (
        <p className="muted">
          {overview.rides} {overview.rides === 1 ? 'Fahrt' : 'Fahrten'}, {overview.totalHours.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Stunden insgesamt, {overview.minutes28} Minuten in den letzten vier Wochen.
          {overview.highlight ? ` ${overview.highlight}` : ''}
        </p>
      )}
      {children}
    </section>
  );
};

/** Complaints and at most one question. Everything can be skipped, no content means no card. */
export const MotivationCard = ({ state, send }: { state: CoachState; send: (m: CoachClientMessage) => void }) => {
  const [answer, setAnswer] = useState('');
  const now = Date.now();
  const profileId = state.profileId;
  const motives = state.motives ?? [];
  const open = (state.complaints ?? []).filter((c) => c.status !== 'over');
  const question = nextQuestion(motives, state.lastQuestionMs, now);
  const submit = () => {
    if (!answer.trim() || !question) return;
    send({ type: 'answer-question', profileId, questionId: question.id, text: answer.trim() });
    setAnswer('');
  };
  if (!open.length && !question && !motives.length) return null;
  return (
    <section className="card motivation">
      {open.map((c) => (
        <div key={c.id} className="notice">
          <p>Wie geht es gerade mit „{c.text}“? ({STATUS[c.status]})</p>
          <div className="row">
            <button className="secondary" onClick={() => send({ type: 'complaint-update', profileId, id: c.id, status: 'over' })}>Wieder gut</button>
            {c.status === 'active' && <button className="secondary" onClick={() => send({ type: 'complaint-update', profileId, id: c.id, status: 'healing' })}>Wird besser</button>}
            {c.status === 'healing' && <button className="secondary" onClick={() => send({ type: 'complaint-update', profileId, id: c.id, status: 'active' })}>Wieder schlechter</button>}
          </div>
        </div>
      ))}
      {question && (
        <form className="note-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label>{question.text}<input aria-label={`Antwort: ${question.text}`} value={answer} onChange={(e) => setAnswer(e.target.value)} /></label>
          <div className="row">
            <button type="submit" className="secondary">Antworten</button>
            <button type="button" className="ghost" onClick={() => send({ type: 'skip-question', profileId })}>Heute nicht</button>
          </div>
        </form>
      )}
      {motives.length > 0 && (
        <details>
          <summary className="muted">Was dich antreibt</summary>
          <ul className="rules">
            {motives.map((m) => (
              <li key={m.atMs}>{m.text} <button className="ghost" aria-label={`${m.text} entfernen`} onClick={() => send({ type: 'remove-motive', profileId, atMs: m.atMs })}>×</button></li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};
