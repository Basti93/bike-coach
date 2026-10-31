import { estimateTss } from '../../coach/guardrails';
import type { Session } from '../../shared/session';
import { WorkoutBar } from './WorkoutBar';

const fmtMin = (s: number) => `${Math.round(s / 60)} Min.`;

/** Die Eckdaten einer Einheit, damit man vor dem Start weiß, was kommt. */
export const SessionFacts = ({ session, ftpW }: { session: Session; ftpW: number }) => {
  const totalS = session.steps.reduce((a, s) => a + s.durationS, 0);
  const ergs = session.steps.flatMap((s) => (s.kind === 'erg' ? [s.ftpFraction] : []));
  const grades = session.steps.flatMap((s) => (s.kind === 'grade' ? [s.gradePct] : []));
  return (
    <dl className="facts">
      <div><dt>Dauer</dt><dd>{fmtMin(totalS)}</dd></div>
      <div><dt>Belastung</dt><dd>{Math.round(estimateTss(session))} TSS</dd></div>
      {grades.length > 0
        ? <div><dt>Steilste Stelle</dt><dd>{Math.max(...grades).toLocaleString('de-DE')} %</dd></div>
        : <div><dt>Bis zu</dt><dd>{Math.round(Math.max(...ergs) * ftpW)} W</dd></div>}
    </dl>
  );
};

export const StepList = ({ session, ftpW }: { session: Session; ftpW: number }) => (
  <details className="steps">
    <summary>Alle {session.steps.length} Abschnitte</summary>
    <ol>
      {session.steps.map((s, i) => (
        <li key={i}>
          <span>{s.label}</span>
          <span className="muted">{fmtMin(s.durationS)} · {s.kind === 'erg' ? `${Math.round(s.ftpFraction * ftpW)} W` : `${s.gradePct.toLocaleString('de-DE')} %`}</span>
        </li>
      ))}
    </ol>
  </details>
);

export const TrainingCard = ({ session, ftpW, tag, why, selected, onPick }: { session: Session; ftpW: number; tag: string; why?: string; selected: boolean; onPick: () => void }) => (
  <article className={selected ? 'card training selected' : 'card training'}>
    <span className="tag">{tag}</span>
    <h4>{session.name}</h4>
    <WorkoutBar session={session} />
    <SessionFacts session={session} ftpW={ftpW} />
    {why && <p className="muted">{why}</p>}
    <button className="secondary" onClick={onPick}>{selected ? 'Ausgewählt' : 'Auswählen'}</button>
  </article>
);
