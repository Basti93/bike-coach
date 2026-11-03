import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LoggedWorkout } from '../shared/records';
import type { GymWorkout } from '../coach/gym/types';
import { openStoreCount } from '../tracking/registry';
import { HistoryScreen, RoutinesScreen, WorkoutScreen } from '../tracking/ui';
import { usePortRecords } from '../tracking/ui/hooks';
import { openIdb } from './idbStore';
import { mobilityToShow, openComplaints, planDateText, planIsStale, readPlan, shouldShowInstallHint } from './logic';
import type { OpenState } from './register';
import { createWebPort, type WebPort } from './webPort';

export type Env = {
  fetchFn: typeof fetch;
  /** Undefined: the browser's own. Null: none available. */
  idbFactory?: IDBFactory | null;
  now: () => number;
  newId: () => string;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  persist: () => Promise<boolean>;
  ua: string;
  standalone: boolean;
  /** Tells the update logic whether a workout is open on this device. */
  onWorkoutOpen?: (state: OpenState) => void;
};

const ACCOUNT_KEY = 'pandafit.account';
const HINT_KEY = 'pandafit.installHint';
const PERSIST_KEY = 'pandafit.persistNote';
const LOGGED_OUT_KEY = 'pandafit.loggedOut';
const OPEN_MAX_AGE_MS = 12 * 3600_000;
const ME_TIMEOUT_MS = 5000;
const LOGIN_TIMEOUT_MS = 15_000;
const NO_STORAGE = 'In diesem Browser können Einträge gerade nicht gespeichert werden, zum Beispiel im privaten Modus. Darum ist das Training hier nicht verfügbar. Öffne Pandafit in einem normalen Fenster oder vom Home-Bildschirm aus.';

const post = (env: Env, path: string, body?: unknown, timeoutMs = LOGIN_TIMEOUT_MS) => env.fetchFn(path, {
  method: 'POST', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
});
const get = (env: Env, path: string, timeoutMs = ME_TIMEOUT_MS) => env.fetchFn(path, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });

function LoginForm({ env, onDone, note, before, failed }: { env: Env; onDone: (name: string) => void; note?: string; before?: () => Promise<void>; failed?: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      await before?.(); // no sync may run while the login changes under it
      const res = await post(env, '/login', { name: name.trim(), password });
      if (res.ok) { setPassword(''); env.storage.removeItem(LOGGED_OUT_KEY); onDone(name.trim().toLowerCase()); return; }
      failed?.();
      setMsg(res.status === 429 ? 'Gerade zu viele Versuche. Warte bitte einen Moment.' : res.status === 401 ? 'Name oder Passwort stimmt nicht. Versuch es gern nochmal.' : 'Das hat gerade nicht geklappt. Versuch es gleich nochmal.');
    } catch (e) {
      failed?.();
      setMsg((e as { name?: string }).name === 'TimeoutError' ? 'Der Server antwortet gerade nicht. Deine Einträge auf diesem Gerät sind sicher. Versuch es gleich nochmal.' : 'Keine Verbindung. Deine Einträge auf diesem Gerät sind sicher. Versuch es gleich nochmal.');
    } finally { setBusy(false); }
  };
  return (
    <form className="web-login tk-screen" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <h1 className="tk-title">Pandafit</h1>
      {note && <p role="status" className="tk-note">{note}</p>}
      <label>Name<input aria-label="Name" autoComplete="username" autoCapitalize="none" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Passwort<input aria-label="Passwort" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {msg && <p role="status" className="tk-note">{msg}</p>}
      <button type="submit" disabled={busy || !name.trim() || !password}>Anmelden</button>
    </form>
  );
}

/** A broken page never leaves a white screen: a calm message, and the way to the workout stays open. */
export class ErrorBoundary extends Component<{ children: ReactNode; onTraining: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="tk-screen">
        <p role="status" className="tk-note">Diese Seite lässt sich gerade nicht anzeigen. Deine Einträge sind nicht verloren.</p>
        <button type="button" onClick={this.props.onTraining}>Zum Training</button>
      </div>
    );
  }
}

function Heute({ port, env, goTraining }: { port: WebPort; env: Env; goTraining: () => void }) {
  const plans = usePortRecords(port, 'plan').records;
  const mobility = usePortRecords(port, 'mobility').records;
  const complaints = usePortRecords(port, 'complaint').records;
  const [text, setText] = useState('');
  const plan = (plans ?? []).find((r) => r.id === 'current');
  const p = readPlan(plan);
  const now = env.now();
  const session = useMemo(() => mobilityToShow(plan, mobility ?? [], now), [plan, mobility, now]);
  const open = openComplaints(complaints ?? []);
  const all = complaints ?? [];

  const markDone = async () => {
    if (!session) return;
    try { await port.put({ kind: 'mobility', id: session.id, updatedMs: env.now(), deleted: false, body: { doneMs: env.now(), forSession: session.forSession } }); } catch { /* shown again next time */ }
  };
  const close = async (id: string) => {
    const r = all.find((x) => x.id === id);
    if (!r) return;
    try { await port.put({ ...r, updatedMs: Math.max(env.now(), r.updatedMs + 1), body: { ...(r.body as object), status: 'over' } }); } catch { /* still open */ }
  };
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    try { await port.put({ kind: 'complaint', id: `phone-${env.newId()}`, updatedMs: env.now(), deleted: false, body: { text: t, status: 'active', atMs: env.now() } }); setText(''); } catch { /* text stays */ }
  };

  return (
    <div className="tk-screen">
      <h1 className="tk-title">Heute</h1>
      {p ? (
        <section className="card">
          <p className="muted">{planDateText(p.atMs)}</p>
          {planIsStale(p.atMs, now) && <p className="muted">Der Plan ist schon etwas älter. Der Mac macht einen neuen, sobald er an ist.</p>}
          {p.workout && <h2>{p.workout.name}</h2>}
          {p.reason && <p>{p.reason}</p>}
          {p.workout && <ul>{p.workout.exercises.map((e, i) => <li key={i}>{e.title}, {e.sets.length} Sätze</li>)}</ul>}
          {p.note && <p>{p.note}</p>}
          {p.questions.length > 0 && <ul>{p.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
          <button type="button" onClick={goTraining}>Zum Training</button>
        </section>
      ) : (
        <section className="card">
          <p>Noch kein Plan da. Der Mac macht einen, sobald er an ist. Du kannst trotzdem jederzeit trainieren.</p>
          <button type="button" onClick={goTraining}>Zum Training</button>
        </section>
      )}
      {session && (
        <section className="card">
          <h2>Beweglichkeit, wenn du magst</h2>
          <p>{session.reason}</p>
          <p className="muted">Etwa {session.minutes} Minuten, {session.exercises.length} Übungen.</p>
          <ol>{session.exercises.map((e) => <li key={e.id}><b>{e.title}</b><p className="muted">{e.howTo}</p></li>)}</ol>
          <button type="button" onClick={() => void markDone()}>Gemacht</button>
        </section>
      )}
      <section className="card">
        <h2>Beschwerden</h2>
        {open.length === 0 && <p className="muted">Nichts offen.</p>}
        {open.map((c) => (
          <div key={c.id} className="tk-row">
            <span>{c.text}</span><span className="spacer" />
            <button type="button" className="secondary" aria-label={`Erledigt: ${c.text}`} onClick={() => void close(c.id)}>Erledigt</button>
          </div>
        ))}
        <div className="tk-row">
          <input aria-label="Neue Beschwerde" placeholder="Was zwickt?" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="secondary" onClick={() => void add()} disabled={!text.trim()}>Hinzufügen</button>
        </div>
      </section>
    </div>
  );
}

function Training({ port, env }: { port: WebPort; env: Env }) {
  const plans = usePortRecords(port, 'plan').records;
  const [screen, setScreen] = useState<'workout' | 'routines'>('workout');
  const [routine, setRoutine] = useState<GymWorkout | null>(null);
  const plan = readPlan((plans ?? []).find((r) => r.id === 'current'));
  return (
    <>
      <div className="tk-screen"><div className="tk-row">
        <button type="button" className="ghost" aria-pressed={screen === 'workout'} onClick={() => { setRoutine(null); setScreen('workout'); }}>Heute trainieren</button>
        <button type="button" className="ghost" aria-pressed={screen === 'routines'} onClick={() => setScreen('routines')}>Routinen</button>
      </div></div>
      {screen === 'workout' && <WorkoutScreen key={routine ? 'routine' : 'plan'} port={port} plan={routine ? null : plan?.workout ?? null} routine={routine} now={env.now} newId={env.newId} />}
      {screen === 'routines' && <RoutinesScreen port={port} now={env.now} newId={env.newId} onStart={(r) => { setRoutine(r); setScreen('workout'); }} />}
    </>
  );
}

type Tab = 'heute' | 'training' | 'verlauf';

function Shell({ account, env, port, onLogout, onRelogin }: { account: string; env: Env; port: WebPort; onLogout: () => void; onRelogin: (name: string) => void }) {
  const [tab, setTab] = useState<Tab>('heute');
  const [confirming, setConfirming] = useState(false);
  const [persistRefused, setPersistRefused] = useState(false);
  const [hint, setHint] = useState(false);
  const [, tick] = useState(0);
  const status = useSyncExternalStore(port.onStatus, port.status);
  const workouts = usePortRecords(port, 'workout').records;

  // Open on this device: a recent open record, or a store this session has opened or still has unsaved. Unknown until the first read.
  const state: OpenState = workouts === null ? 'unknown'
    : openStoreCount(port) > 0 || workouts.some((r) => (r.body as LoggedWorkout).endMs === null && env.now() - r.updatedMs < OPEN_MAX_AGE_MS) ? 'open' : 'none';
  const lastState = useRef<OpenState | null>(null);
  useEffect(() => { if (lastState.current !== state) { lastState.current = state; env.onWorkoutOpen?.(state); } });
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    void env.persist().then((ok) => {
      if (!ok && env.storage.getItem(PERSIST_KEY) !== '1') { env.storage.setItem(PERSIST_KEY, '1'); setPersistRefused(true); }
    }, () => {});
    if (shouldShowInstallHint({ ua: env.ua, standalone: env.standalone, seen: env.storage.getItem(HINT_KEY) === '1' })) {
      setHint(true);
      env.storage.setItem(HINT_KEY, '1');
    }
    void port.sync();
  }, [env, port]);

  const tryLogout = () => {
    const c = port.syncState();
    if (c.pending > 0 || (c.refused ?? 0) > 0) setConfirming(true); else onLogout();
  };

  return (
    <>
      <nav aria-label="Seiten" className="web-nav">
        {(['heute', 'training', 'verlauf'] as const).map((t) => (
          <button key={t} type="button" className="ghost" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'heute' ? 'Heute' : t === 'training' ? 'Training' : 'Verlauf'}</button>
        ))}
        <button type="button" className="ghost" onClick={tryLogout}>Abmelden</button>
      </nav>
      <main className="web-main">
        {status === 'login' && (
          <div className="tk-screen">
            <LoginForm env={env}
              note="Bitte melde dich neu an. Alles auf diesem Gerät bleibt erhalten, auch ein offenes Training."
              before={() => port.pause()} failed={() => port.resume()}
              onDone={(n) => { if (n === account) { port.resume(); void port.sync(); } else onRelogin(n); }} />
          </div>
        )}
        {confirming && (
          <div className="tk-screen"><p role="status" className="tk-note">
            Einiges ist noch nicht gesendet. Es bleibt auf diesem Gerät gespeichert und geht beim nächsten Anmelden raus.
            <button type="button" onClick={onLogout}>Trotzdem abmelden</button>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>Doch nicht</button>
          </p></div>
        )}
        {hint && <div className="tk-screen"><p role="status" className="tk-note">Tipp: Tippe unten auf Teilen und dann auf „Zum Home-Bildschirm“, dann öffnet sich Pandafit wie eine App.</p></div>}
        {persistRefused && <div className="tk-screen"><p role="status" className="tk-note">Dein Browser hat dauerhaften Speicher nicht zugesagt. Deine Einträge liegen trotzdem auf dem Gerät und gehen raus, sobald es geht.</p></div>}
        <ErrorBoundary key={tab} onTraining={() => setTab('training')}>
          {tab === 'heute' && <Heute port={port} env={env} goTraining={() => setTab('training')} />}
          {tab === 'training' && <Training port={port} env={env} />}
          {tab === 'verlauf' && <HistoryScreen port={port} now={env.now} />}
        </ErrorBoundary>
      </main>
    </>
  );
}

type Phase = { kind: 'loading' } | { kind: 'login' } | { kind: 'offline' } | { kind: 'nostorage' } | { kind: 'in'; account: string };

const factoryOf = (env: Env): IDBFactory | null => (env.idbFactory === undefined ? (typeof indexedDB === 'undefined' ? null : indexedDB) : env.idbFactory);

export function App({ env }: { env: Env }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [port, setPort] = useState<{ account: string; port: WebPort } | null>(null);
  const portRef = useRef<WebPort | null>(null);
  portRef.current = port?.port ?? null;

  /** Opens the account's local data. Without a usable IndexedDB nothing can be stored, and that is said plainly. */
  const enter = useCallback(async (account: string): Promise<boolean> => {
    const factory = factoryOf(env);
    if (!factory) { setPhase({ kind: 'nostorage' }); return false; }
    let store;
    try { store = await openIdb(account, factory); } catch { setPhase({ kind: 'nostorage' }); return false; }
    portRef.current?.dispose();
    const p = createWebPort({ store, account, fetchFn: env.fetchFn, now: env.now });
    env.storage.setItem(ACCOUNT_KEY, account);
    setPort({ account, port: p });
    setPhase({ kind: 'in', account });
    return true;
  }, [env]);

  /** Tell the server about a logout that could not be sent while offline. */
  const retryLogout = useCallback(() => {
    void post(env, '/logout', undefined, ME_TIMEOUT_MS).then(() => env.storage.removeItem(LOGGED_OUT_KEY), () => {});
  }, [env]);

  const boot = useCallback(async () => {
    setPhase({ kind: 'loading' });
    if (!factoryOf(env)) { setPhase({ kind: 'nostorage' }); return; }
    if (env.storage.getItem(LOGGED_OUT_KEY) === '1') { retryLogout(); setPhase({ kind: 'login' }); return; }
    // The last account on this device opens at once from its local data; its login is checked in the background.
    const last = env.storage.getItem(ACCOUNT_KEY);
    if (last) { await enter(last); return; } // a failure to open is the "no storage" message
    try {
      const res = await get(env, '/me');
      if (res.ok) {
        const me = (await res.json()) as { name?: unknown };
        if (typeof me.name === 'string') { await enter(me.name.toLowerCase()); return; }
      }
      if (res.status === 401) { setPhase({ kind: 'login' }); return; }
      throw new Error('unexpected');
    } catch { setPhase({ kind: 'offline' }); }
  }, [env, enter, retryLogout]);

  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => () => portRef.current?.dispose(), []);
  // Without a workout page (login, offline start, no storage) there is nothing to protect; while loading it stays unknown.
  useEffect(() => { if (phase.kind !== 'in' && phase.kind !== 'loading') env.onWorkoutOpen?.('none'); }, [phase.kind, env]);

  const afterLogin = async (name: string) => {
    void env.persist().catch(() => false); // requested at login, while the tap counts as a gesture
    try {
      const res = await get(env, '/me');
      const me = res.ok ? ((await res.json()) as { name?: unknown }) : null;
      await enter(typeof me?.name === 'string' ? me.name.toLowerCase() : name);
    } catch { await enter(name); }
  };
  const logout = async () => {
    const p = portRef.current;
    if (p) await p.pause();
    p?.dispose();
    setPort(null);
    env.storage.removeItem(ACCOUNT_KEY); // the data stays on the device; the login does not
    try { await post(env, '/logout', undefined, ME_TIMEOUT_MS); } catch { env.storage.setItem(LOGGED_OUT_KEY, '1'); } // offline: asked again at the next start
    setPhase({ kind: 'login' });
  };

  if (phase.kind === 'loading') return <main className="web-main"><p className="muted tk-screen">Einen Moment …</p></main>;
  if (phase.kind === 'nostorage') return <main className="web-main tk-screen"><p role="status" className="tk-note">{NO_STORAGE}</p></main>;
  if (phase.kind === 'offline') return <main className="web-main tk-screen"><p role="status" className="tk-note">Keine Verbindung. Zum ersten Anmelden braucht Pandafit kurz Internet.</p><button type="button" onClick={() => void boot()}>Nochmal versuchen</button></main>;
  if (phase.kind === 'login' || !port) return <main className="web-main"><LoginForm env={env} onDone={(n) => void afterLogin(n)} /></main>;
  return <Shell key={port.account} account={port.account} env={env} port={port.port} onLogout={() => void logout()} onRelogin={(n) => void afterLogin(n)} />;
}
