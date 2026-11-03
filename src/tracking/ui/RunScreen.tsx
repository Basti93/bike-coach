import { useState } from 'react';
import type { TrackedRecord } from '../../shared/records';
import { manualRunId, paceText, runSendId, weekFp, type PlannedRun, type RunGarmin, type RunNumbers, type RunSendBody, type RunWeekBody, type ManualRunBody } from '../../shared/run';
import type { TrackingPort } from '../ports';
import { usePortRecords } from './hooks';
import { writeSettings } from './RunSettingsCard';
import { DAY_NAMES, DAY_SHORT, dateKeyOf, dayText, kmFromKm, nextUpdatedMs, runView } from './run-view';

const KIND: Record<PlannedRun['kind'], string> = { easy: 'Ruhiger Lauf', long: 'Langer, ruhiger Lauf', test: 'Testlauf über 30 Minuten' };
const CHANGED = 'Der Plan hat sich geändert. Bitte bestätige noch einmal, dann geht die neue Version an Garmin.';
const STALE = 'Inzwischen gibt es einen neueren Plan. Bitte schau ihn dir an und bestätige noch einmal.';
const LEFT_ON_WATCH = 'Auf deiner Uhr sind noch geplante Läufe. Sollen sie entfernt werden?';
const PAUSE = 'Laufen pausiert, solange die Beschwerde offen ist. Sobald sie vorbei ist, geht es ruhig weiter.';
const GENTLE = 'Wir planen gerade sanft.';
const FAILED = 'Das Senden hat gerade nicht geklappt. Du kannst es später noch einmal versuchen.';

const num = (s: string): number | null => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

function Suggestion({ onAnswer }: { onAnswer: (on: boolean) => void }) {
  return (
    <section className="card">
      <p>Pandafit hat Läufe von deiner Uhr gefunden. Soll Pandafit dein Laufen mitplanen?</p>
      <div className="tk-row">
        <button type="button" onClick={() => onAnswer(true)}>Laufen einschalten</button>
        <button type="button" className="secondary" onClick={() => onAnswer(false)}>Nicht jetzt</button>
      </div>
    </section>
  );
}

type Answers = { runsPerWeek: number; usualMinutes: number; pain: boolean };
function Questions({ suggested, saved, onSave, onCancel }: {
  suggested: number[]; saved: { answers: Answers | null; weekdays: number[] | null } | null;
  onSave: (a: Answers, days: number[]) => void; onCancel?: () => void;
}) {
  const start = saved?.weekdays?.length ? saved.weekdays : suggested;
  const [perWeek, setPerWeek] = useState(String(saved?.answers?.runsPerWeek ?? (start.length || 3)));
  const [minutes, setMinutes] = useState(String(saved?.answers?.usualMinutes ?? 30));
  const [pain, setPain] = useState(saved?.answers?.pain ?? false);
  const [days, setDays] = useState<number[]>(start);
  const toggle = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort((a, b) => a - b)));
  const p = num(perWeek);
  const m = num(minutes);
  const ok = days.length > 0 && p !== null && p >= 1 && p <= 7 && m !== null && m >= 5 && m <= 300;
  return (
    <section className="card tk-form">
      <label className="tk-field">Wie oft läufst du pro Woche?
        <input inputMode="numeric" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
      </label>
      <label className="tk-field">Wie lange dauert ein Lauf meist (Minuten)?
        <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </label>
      <label className="tk-check"><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Hast du beim Laufen gerade Schmerzen?</label>
      <div role="group" aria-label="An welchen Tagen möchtest du laufen?" className="tk-field">
        <span>An welchen Tagen möchtest du laufen?</span>
        <div className="tk-row">
          {DAY_NAMES.map((n, d) => (
            <button key={n} type="button" aria-label={n} aria-pressed={days.includes(d)} className={`tk-day${days.includes(d) ? '' : ' secondary'}`} onClick={() => toggle(d)}>{DAY_SHORT[d]}</button>
          ))}
        </div>
      </div>
      <div className="tk-row">
        <button type="button" disabled={!ok} onClick={() => ok && onSave({ runsPerWeek: Math.round(p), usualMinutes: Math.round(m), pain }, days)}>Speichern</button>
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Abbrechen</button>}
      </div>
    </section>
  );
}

function GarminBlock({ week, pending, onSend }: { week: RunWeekBody; pending: boolean; onSend: () => void }) {
  const g: RunGarmin | null = week.garmin;
  if (!g) return null; // no Garmin object: the bridge is not ready, so nothing is offered
  const status = g.status;
  if (status === 'sent') return <p className="tk-garmin">Auf deiner Uhr</p>;
  return (
    <div className="tk-garmin">
      {status === 'changed' && <p role="status">{CHANGED}</p>}
      {status === 'stale' && <p role="status">{STALE}</p>}
      {status === 'failed' && <p role="status">{FAILED}</p>}
      <button type="button" disabled={status === 'sending' || pending} onClick={onSend}>An Garmin senden</button>
    </div>
  );
}

function Spark({ trend }: { trend: (number | null)[] }) {
  const points = trend.slice(-12);
  const speeds = points.map((p) => (p === null || p <= 0 ? null : 1 / p));
  const vals = speeds.filter((s): s is number => s !== null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return (
    <div className="tk-spark" role="img" aria-label="Ruhiges Tempo über die letzten 12 Wochen, höhere Balken sind schneller">
      {speeds.map((s, i) => <span key={i} style={{ height: s === null ? '0%' : `${hi === lo ? 60 : 25 + (75 * (s - lo)) / (hi - lo)}%` }} />)}
    </div>
  );
}

function Progress({ n }: { n: RunNumbers }) {
  const p = n.easyPace;
  const rows: [string, number | null][] = [['Jetzt', p.now], ['vor 4 Wochen', p.weeks4], ['vor 12 Wochen', p.weeks12]];
  if (rows.every(([, v]) => v === null)) return null;
  return (
    <section className="card">
      <h2>Dein Fortschritt</h2>
      <p className="muted">Ruhiges Tempo bei gleichem Puls. Ein einzelner Lauf sagt dazu nichts.</p>
      <dl className="tk-pace">
        {rows.map(([label, v]) => (v === null ? null : <div key={label}><dt>{label}</dt><dd>{paceText(v)}</dd></div>))}
      </dl>
      <Spark trend={p.trend} />
    </section>
  );
}

function Longest({ n }: { n: RunNumbers }) {
  const { blockKm, lastBlockKm } = n.longest;
  if (blockKm === null) return null;
  return (
    <section className="card">
      <h2>Längster Lauf</h2>
      <dl className="tk-pace">
        <div><dt>Letzte 4 Wochen</dt><dd>{kmFromKm(blockKm)}</dd></div>
        {lastBlockKm !== null && <div><dt>4 Wochen davor</dt><dd>{kmFromKm(lastBlockKm)}</dd></div>}
      </dl>
    </section>
  );
}

function WeeklyKm({ n }: { n: RunNumbers }) {
  const weeks = n.weeks.slice(-8);
  if (weeks.every((w) => w.km === 0)) return null;
  const max = Math.max(1, ...weeks.map((w) => w.km));
  return (
    <section className="card">
      <h2>Kilometer pro Woche</h2>
      <ul className="tk-progress">
        {weeks.map((w) => (
          <li key={w.week}><span>ab {dayText(w.week).replace(/^\S+, /, '')}</span><span className="tk-bar" style={{ width: `${Math.max(4, (w.km / max) * 100)}%` }} /><span>{kmFromKm(w.km)}</span></li>
        ))}
      </ul>
    </section>
  );
}

function ManualForm({ plannedOn, now, onSave }: { plannedOn: (date: string) => PlannedRun | null; now: number; onSave: (r: Omit<ManualRunBody, 'type' | 'runType'>) => void }) {
  const d = new Date(now);
  const [date, setDate] = useState(dateKeyOf(now));
  const [time, setTime] = useState(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [hr, setHr] = useState('');
  const testDay = plannedOn(date)?.kind === 'test';
  const dur = num(minutes);
  const dist = num(km);
  const avg = num(hr);
  const startMs = new Date(`${date}T${time}`).getTime();
  const ok = dur !== null && dur > 0 && dist !== null && dist >= 0 && Number.isFinite(startMs) && (hr.trim() === '' || (avg !== null && avg > 0));
  const [open, setOpen] = useState(false);
  const save = () => {
    if (!ok) return;
    onSave({ startMs, durationS: Math.round(dur * 60), distanceM: Math.round(dist * 1000), avgHr: avg === null ? null : Math.round(avg) });
    setMinutes(''); setKm(''); setHr(''); setOpen(false);
  };
  // Closed by default: most runs come from Garmin, the form would take half the page.
  if (!open) return <button type="button" className="secondary" onClick={() => setOpen(true)}>Lauf eintragen</button>;
  return (
    <section className="card tk-form">
      <h2>Lauf eintragen</h2>
      <div className="tk-row tk-run-when">
        <label className="tk-field">Datum<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="tk-field">Beginn<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="tk-row tk-run-nums">
        <label className="tk-field">Dauer in Minuten<input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label className="tk-field">{testDay ? 'Strecke in den 30 Minuten' : 'Strecke in km'}<input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></label>
        <label className="tk-field">Puls im Schnitt (optional)<input inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} /></label>
      </div>
      {testDay && <p className="muted">An diesem Tag ist ein Testlauf geplant. Trag die Strecke ein, die du in 30 Minuten geschafft hast, in km.</p>}
      <div className="tk-row">
        <button type="button" disabled={!ok} onClick={save}>Lauf speichern</button>
        <button type="button" className="ghost" onClick={() => setOpen(false)}>Abbrechen</button>
      </div>
    </section>
  );
}

/** The run page, shared by the phone and the Mac. Only records in, only records out. */
export function RunScreen({ port, now, newId }: { port: TrackingPort; now: () => number; newId: () => string }) {
  const q = usePortRecords(port, 'run');
  const [editing, setEditing] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const view = runView(q.records ?? [], now());
  if (q.records === null || !view.visible || !view.status) return null;
  const { status, week } = view;
  const all = q.all ?? [];
  const byId = (id: string): TrackedRecord | undefined => all.find((r) => r.id === id);
  const put = (id: string, body: object) => { void port.put({ kind: 'run', id, updatedMs: nextUpdatedMs(now(), byId(id)), deleted: false, body }).catch(() => {}); };

  const paused = status.complaint === 'pause';
  const gentle = status.complaint === 'half' || view.settings?.answers?.pain === true;
  const todayKey = dateKeyOf(now());
  const today = !paused ? week?.runs.find((r) => r.date === todayKey) ?? null : null;
  const fp = week ? weekFp(week.runs) : '';
  const sendRec = week ? byId(runSendId(week.week)) : undefined;
  const sendBody = sendRec && !sendRec.deleted ? (sendRec.body as RunSendBody) : null;
  const pending = !!(week && sendBody && sendBody.week === week.week && sendBody.fp === fp && sendBody.atMs > (week.garmin?.confirmedMs ?? 0));
  const send = () => { if (week) put(runSendId(week.week), { type: 'send', week: week.week, fp, atMs: now() } satisfies RunSendBody); };
  // Workouts sent before the pause that are still ahead on the watch: the same confirmation, with the paused week, removes them.
  const leftOnWatch = paused && status.garmin && !!week?.garmin && Object.keys(week.garmin.sent).some((d) => d >= todayKey);

  // The coach's status lags behind a save: once the settings hold days and answers, the questions are done here.
  const answered = !!(view.settings?.answers && view.settings.weekdays?.length);
  const asking = editing || (status.needsAnswers && !answered);

  return (
    <div className="tk-screen tk-run">
      <h1 className="tk-title">Laufen</h1>
      {status.suggest && !status.on && <Suggestion onAnswer={(on) => { void writeSettings(port, all, now(), (old) => ({ type: 'settings', on, weekdays: old?.weekdays ?? null, answers: old?.answers ?? null })).catch(() => {}); }} />}
      {status.on && (asking ? (
        <Questions suggested={status.suggestedDays} saved={view.settings ?? null} onCancel={editing ? () => setEditing(false) : undefined}
          onSave={(answers, days) => {
            setEditing(false); setSavedNote(true);
            void writeSettings(port, all, now(), (old) => ({ type: 'settings', on: old?.on ?? true, weekdays: days, answers })).catch(() => setSavedNote(false));
          }} />
      ) : (
        <div className="tk-row">
          {savedNote && <p role="status" className="muted">Gespeichert. Der Coach plant deine Woche damit neu, das dauert einen Moment.</p>}
          <button type="button" className="secondary" onClick={() => { setSavedNote(false); setEditing(true); }}>Lauftage und Angaben ändern</button>
        </div>
      ))}
      {status.on && paused && <p role="status" className="tk-note">{PAUSE}</p>}
      {status.on && leftOnWatch && week && (
        <section className="card tk-garmin">
          <p>{LEFT_ON_WATCH}</p>
          <button type="button" disabled={week.garmin?.status === 'sending' || pending} onClick={send}>Entfernen</button>
        </section>
      )}
      {status.on && gentle && !paused && <p role="status" className="tk-note">{GENTLE}</p>}
      {status.on && !paused && today && (
        <section className="card">
          <h2>Was heute zählt</h2>
          <p><b>{KIND[today.kind]}</b> · {today.minutes} Min.{today.hrCap !== null ? ` · Puls bis ${today.hrCap}` : ''}</p>
          <p>{today.counts}</p>
        </section>
      )}
      {status.on && !paused && week && week.runs.length > 0 && (
        <section className="card" aria-label="Läufe dieser Woche">
          {week.reason && <p className="muted">{week.reason}</p>}
          <p className="muted">Deine Läufe dieser Woche ({week.runs.length}) stehen mit allen anderen Sportarten im Tab Woche.</p>
          {week.note && <p>{week.note}</p>}
          {status.garmin && <GarminBlock week={week} pending={pending} onSend={send} />}
        </section>
      )}
      {status.on && status.card && (
        <section className="card" aria-label="Dein letzter Lauf">
          <p><b>{dayText(status.card.date)}</b></p>
          <p>{status.card.result}</p>
          <p className="muted">{status.card.counted}</p>
          <p>{status.card.sentence}</p>
        </section>
      )}
      {status.on && (
        <>
          <Progress n={status.numbers} />
          <Longest n={status.numbers} />
          <WeeklyKm n={status.numbers} />
          <ManualForm plannedOn={(d) => (paused ? null : week?.runs.find((r) => r.date === d) ?? null)} now={now()} onSave={(r) => put(manualRunId(newId()), { type: 'manual', ...r, runType: 'running' } satisfies ManualRunBody)} />
        </>
      )}
    </div>
  );
}
