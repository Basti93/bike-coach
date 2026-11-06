import { useState } from 'react';
import { deleteRule, goalOf, goalRecord, moveRule, rulesOf, type RuleState } from '../../shared/personal';
import type { Exercise } from '../../shared/exercises';
import type { TrackedRecord } from '../../shared/records';
import type { TrackingPort } from '../ports';
import { DECLINE, DECLINED, TAKE, UNDO } from '../../shared/wording';

/**
 * The coach's proposal for a rule or a goal change: the text, for exclude rules what it affects, and Übernehmen / Nein danke.
 * After taking: "Gilt ab jetzt" with Rückgängig (deletes the rule). A goal change writes the goal record when taken.
 * The state lives in the `rule` record, so a reload or a second device shows the same.
 */
export function RuleCard({ port, ruleId, records, catalog, now }: { port: TrackingPort; ruleId: string; records: TrackedRecord[] | null; catalog: readonly Exercise[]; now: () => number }) {
  const [failed, setFailed] = useState(false);
  const rec = (records ?? []).find((r) => r.id === ruleId);
  const rule = rulesOf(records ?? []).find((r) => r.id === ruleId);
  if (!rule) return rec?.deleted ? <div className="tk-nextchange"><p className="muted">Rückgängig gemacht.</p></div> : null;
  const go = async (to: RuleState) => {
    try {
      const cur = (await port.list('rule')).find((r) => r.id === ruleId);
      const next = cur ? moveRule(cur, to, now()) : null;
      if (next && to === 'active' && rule.kind === 'goal' && rule.goal) {
        const goals = await port.list('goal');
        await port.put(goalRecord({ ...goalOf(goals), ...rule.goal }, now(), goals.find((g) => g.id === 'goal')));
      }
      if (next) await port.put(next);
      setFailed(false);
    } catch { setFailed(true); }
  };
  const undo = async () => {
    try {
      const cur = (await port.list('rule')).find((r) => r.id === ruleId);
      if (cur) await port.put(deleteRule(cur, now()));
      setFailed(false);
    } catch { setFailed(true); }
  };
  const titles = (rule.exerciseIds ?? []).map((id) => catalog.find((e) => e.id === id)?.title ?? id);
  return (
    <div className="tk-nextchange">
      <p>{rule.state === 'proposed' ? (rule.kind === 'goal' ? `Neues Ziel: ${rule.text}` : `Neue Regel: ${rule.text}`) : rule.text}</p>
      {rule.kind === 'exclude' && titles.length > 0 && <p className="muted">Betrifft: {titles.join(', ')}</p>}
      {rule.state === 'proposed' && (
        <div className="tk-row">
          <button type="button" onClick={() => void go('active')}>{TAKE}</button>
          <button type="button" className="ghost" onClick={() => void go('declined')}>{DECLINE}</button>
        </div>
      )}
      {(rule.state === 'active' || rule.state === 'paused') && (
        <div className="tk-row">
          <span className="muted">{rule.kind === 'goal' ? 'Ziel geändert.' : rule.state === 'paused' ? 'Pausiert.' : 'Gilt ab jetzt.'}</span>
          {rule.kind !== 'goal' && <button type="button" className="ghost" onClick={() => void undo()}>{UNDO}</button>}
        </div>
      )}
      {rule.state === 'declined' && <p className="muted">{DECLINED}.</p>}
      {failed && <p role="status" className="tk-note">Gerade nicht gespeichert. Versuch es gleich nochmal.</p>}
    </div>
  );
}
