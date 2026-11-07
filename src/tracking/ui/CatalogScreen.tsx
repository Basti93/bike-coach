import { useMemo, useState } from 'react';
import { descriptionOf } from '../../shared/exercise-descriptions';
import type { Exercise } from '../../shared/exercises';
import { familyLabel, familyOf } from '../../shared/families';
import { excludeRuleRecord, moveRule, rulesExcluding } from '../../shared/personal';
import { exerciseImages, videoSearchUrl } from '../media';
import type { TrackingPort } from '../ports';
import { matchesSearch } from '../similar';
import { ExerciseInfo } from './ExerciseInfo';
import { useCatalog, useExcluded, usePortRecords } from './hooks';
import { EQUIPMENT, muscleLabel } from './labels';

/**
 * All exercises of the catalog to browse: search, then the muscle groups (collapsed, with a count), one light line per
 * exercise. A tap opens its description; from there the person rules it out (one or the whole family) or allows it again.
 */
export function CatalogScreen({ port, now = Date.now, newId = () => crypto.randomUUID() }: { port: TrackingPort; now?: () => number; newId?: () => string }) {
  const catalog = useCatalog(port);
  const excluded = useExcluded(port);
  const rules = usePortRecords(port, 'rule').all;
  const [q, setQ] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const needle = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const by = new Map<string, Exercise[]>();
    for (const e of catalog) if (matchesSearch(e, needle)) by.set(e.primaryMuscle, [...(by.get(e.primaryMuscle) ?? []), e]);
    for (const list of by.values()) list.sort((a, b) => a.title.localeCompare(b.title, 'de'));
    return [...by.entries()].sort((a, b) => muscleLabel(a[0]).localeCompare(muscleLabel(b[0]), 'de'));
  }, [catalog, needle]);

  const attempt = async (f: () => Promise<unknown>) => {
    try { await f(); setError(false); } catch { setError(true); }
  };
  const exclude = (e: Exercise, wholeFamily?: string) => attempt(() => port.put(excludeRuleRecord(e, wholeFamily, newId(), now())));
  /** Pauses the person's own rules that cover the exercise. Rules from the chat are left to the rules card. */
  const allow = (e: Exercise) => attempt(async () => {
    const live = await port.list('rule');
    for (const r of rulesExcluding(live, e).filter((x) => x.source !== 'chat')) {
      const cur = live.find((x) => x.id === r.id);
      const next = cur ? moveRule(cur, 'paused', now()) : null;
      if (next) await port.put(next);
    }
  });

  const details = (e: Exercise) => {
    const fam = familyOf(e);
    const isOut = excluded.has(e.id);
    const covering = isOut ? rulesExcluding(rules ?? [], e) : [];
    const own = covering.filter((r) => r.source !== 'chat');
    const fromChat = covering.filter((r) => r.source === 'chat');
    return (
      <ExerciseInfo title={e.title} description={descriptionOf(e)} images={exerciseImages(e.id)} video={videoSearchUrl(e)}>
        {fam !== 'other' && <p className="muted tk-family">{familyLabel(fam)}</p>}
        {isOut ? (
          <>
            {fromChat.length > 0 && <p className="muted tk-note">Ausgeschlossen durch die Regel „{fromChat[0].text}“. Du findest sie unter Woche.</p>}
            {own.length > 0 && <div className="tk-row"><button type="button" className="secondary" onClick={() => void allow(e)}>Wieder erlauben</button></div>}
          </>
        ) : (
          <div className="tk-row">
            <button type="button" className="ghost" onClick={() => void exclude(e)}>Ausschließen</button>
            {fam !== 'other' && <button type="button" className="ghost" onClick={() => void exclude(e, fam)}>Alle Varianten ausschließen</button>}
          </div>
        )}
      </ExerciseInfo>
    );
  };

  return (
    <div className="tk-screen">
      <h1 className="tk-title">Übungen</h1>
      <input className="tk-search" aria-label="Übung suchen" placeholder="Übung oder Muskel suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p role="alert" className="tk-note">Konnte nicht gespeichert werden. Versuch es gleich nochmal.</p>}
      {groups.length === 0 && <p className="muted">Nichts gefunden.</p>}
      {groups.map(([muscle, list]) => {
        const open = needle !== '' || openGroup === muscle;
        return (
          <section key={muscle} className="tk-cat-group">
            <button type="button" className="ghost tk-cat-head" aria-expanded={open} onClick={() => setOpenGroup(openGroup === muscle ? null : muscle)}>
              <span>{muscleLabel(muscle)}</span><span className="muted">{list.length}</span>
            </button>
            {open && (
              <div className="tk-list">
                {list.map((e) => (
                  <div key={e.id} className="tk-pick-item">
                    <button type="button" className="tk-pick tk-cat-line" aria-expanded={info === e.id} onClick={() => setInfo(info === e.id ? null : e.id)}>
                      {e.title}<small> · {EQUIPMENT[e.equipment] ?? e.equipment}</small>
                      {excluded.has(e.id) && <small className="tk-out"> · ausgeschlossen</small>}
                    </button>
                    {info === e.id && details(e)}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
