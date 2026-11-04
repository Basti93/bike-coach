import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LoggedWorkout } from '../shared/records';
import type { GymWorkout } from '../coach/gym/types';
import { openStoreCount } from '../tracking/registry';
import { HistoryScreen, RoutinesScreen, RunLookBack, RunScreen, RunSettingsCard, StatsScreen, WorkoutScreen } from '../tracking/ui';
import { statsVisible } from '../tracking/ui/StatsScreen';
import { CoachScreen } from '../tracking/ui/CoachScreen';
import { TodayCard, todayPlan } from '../tracking/ui/TodayCard';
import { runView } from '../tracking/ui/run-view';
import { MobilityOffer } from '../tracking/ui/MobilityOffer';
import { GymOutlook } from '../tracking/ui/GymOutlook';
import { usePortRecords } from '../tracking/ui/hooks';
import { openIdb } from './idbStore';
import { mobilityToShow, planDateText, planIsStale, readPlan, shouldShowInstallHint } from './logic';
import type { OpenState } from './register';
import { createWebPort, type WebPort } from './webPort';
import { MealsScreen, mealWeeks } from './MealsScreen';
import { TogetherCard, TogetherPage, togetherOf } from './TogetherScreen';
import type { PushEnv, SubJson } from './push';

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
  /** Push notifications; undefined where there is no service worker (dev). */
  push?: PushEnv;
  /** The tab a notification opened the app with. */
  startTab?: string | null;
  /** A notification tapped while the app is open asks for a tab. Returns the unsubscribe. */
  onOpenTab?: (f: (tab: string) => void) => () => void;
};

const ACCOUNT_KEY = 'pandafit.account';
const HINT_KEY = 'pandafit.installHint';
const LOGGED_OUT_KEY = 'pandafit.loggedOut';
const OPEN_MAX_AGE_MS = 12 * 3600_000;
const ME_TIMEOUT_MS = 5000;
const LOGIN_TIMEOUT_MS = 15_000;
const NO_STORAGE = 'In diesem Browser können Einträge nicht gespeichert werden. Darum ist das Training hier nicht verfügbar. Versuch es in einem anderen Browser oder vom Home-Bildschirm aus.';
const STORAGE_FAILED = 'Der Speicher auf diesem Gerät antwortet gerade nicht. Deine Einträge sind nicht verloren. Versuch es gleich nochmal.';
/** Only an answer from the server ends the session: 2xx, or 401 (already gone). Errors and 5xx leave it open. */
const loggedOut = (res: Response): boolean => res.ok || res.status === 401;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
        <button type="button" onClick={() => { this.setState({ failed: false }); this.props.onTraining(); }}>Zum Training</button>
      </div>
    );
  }
}

function Heute({ port, env, account, goTraining, goRun, goCoach }: { port: WebPort; env: Env; account: string; goTraining: () => void; goRun?: () => void; goCoach: () => void }) {
  const plans = usePortRecords(port, 'plan').records;
  const mobility = usePortRecords(port, 'mobility').records;
  const weekplans = usePortRecords(port, 'weekplan').records;
  const runs = usePortRecords(port, 'run').records;
  // Only when the Mac sent one for this account: without a link Heute stays as it was.
  const together = togetherOf(usePortRecords(port, 'together').records);
  const [showTogether, setShowTogether] = useState(false);
  const plan = (plans ?? []).find((r) => r.id === 'current');
  const p = readPlan(plan);
  const now = env.now();
  const session = useMemo(() => mobilityToShow(plan, mobility ?? [], now), [plan, mobility, now]);
  const today = todayPlan(weekplans, now);

  const markDone = async () => {
    if (!session) return;
    try { await port.put({ kind: 'mobility', id: session.id, updatedMs: env.now(), deleted: false, body: { doneMs: env.now(), forSession: session.forSession } }); } catch { /* shown again next time */ }
  };

  // The strength plan: on a strength day inside the week plan's card, without a week plan as its own card.
  const gym = p ? (
    <>
      <p className="muted">{planDateText(p.atMs)}</p>
      {planIsStale(p.atMs, now) && <p className="muted">Der Plan ist schon etwas älter. Der Coach macht einen neuen, sobald er dazu kommt.</p>}
      {p.workout && <h2>{p.workout.name}</h2>}
      {p.reason && <p>{p.reason}</p>}
      {p.workout && <ul>{p.workout.exercises.map((e, i) => <li key={i}>{e.title}, {e.sets.length} Sätze</li>)}</ul>}
      {p.note && <p>{p.note}</p>}
      {p.questions.length > 0 && <ul>{p.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
      <button type="button" onClick={goTraining}>Zum Krafttraining</button>
      <GymOutlook outlook={p.outlook} />
    </>
  ) : (
    <>
      <p>Noch kein Krafttraining geplant. Du kannst trotzdem jederzeit trainieren.</p>
      <button type="button" onClick={goTraining}>Zum Krafttraining</button>
    </>
  );

  if (together && showTogether) return <TogetherPage t={together} now={now} onBack={() => setShowTogether(false)} />;
  return (
    <div className="tk-screen">
      <h1 className="tk-title">Heute</h1>
      {together && <TogetherCard t={together} now={now} onOpen={() => setShowTogether(true)} />}
      {today ? <TodayCard weekplans={weekplans} runs={runs} nowMs={now} gym={gym} onRun={goRun} /> : (
        <>
          <section className="card">{gym}</section>
          <section className="card">
            <p className="muted">Noch kein Wochenplan für heute. Mit dem Coach plant ihr die Woche über alle Sportarten.</p>
            <button type="button" className="secondary" onClick={goCoach}>Woche planen</button>
          </section>
        </>
      )}
      {session && <MobilityOffer key={session.id} session={session} hideKey={`pandafit.mobility.notToday.${account}`} storage={env.storage} now={env.now} onDone={() => void markDone()} />}
    </div>
  );
}

function Training({ port, env }: { port: WebPort; env: Env }) {
  const plans = usePortRecords(port, 'plan').records;
  const [screen, setScreen] = useState<'workout' | 'routines' | 'history'>('workout');
  const [routine, setRoutine] = useState<GymWorkout | null>(null);
  const plan = readPlan((plans ?? []).find((r) => r.id === 'current'));
  return (
    <>
      <div className="tk-screen"><div className="tk-seg" role="group" aria-label="Kraft">
        <button type="button" aria-pressed={screen === 'workout'} onClick={() => { setRoutine(null); setScreen('workout'); }}>Training</button>
        <button type="button" aria-pressed={screen === 'routines'} onClick={() => setScreen('routines')}>Routinen</button>
        <button type="button" aria-pressed={screen === 'history'} onClick={() => setScreen('history')}>Verlauf</button>
      </div></div>
      {screen === 'workout' && <WorkoutScreen key={routine ? 'routine' : 'plan'} port={port} plan={routine ? null : plan?.workout ?? null} routine={routine} now={env.now} newId={env.newId} />}
      {screen === 'history' && <HistoryScreen port={port} now={env.now} />}
      {screen === 'routines' && <RoutinesScreen port={port} now={env.now} newId={env.newId} onStart={(r) => { setRoutine(r); setScreen('workout'); }} />}
    </>
  );
}

const pushKey = (account: string) => `pandafit.push.${account}`;
const cardKey = (account: string) => `pandafit.pushCard.${account}`;
const PUSH_INSTALL = 'Auf dem iPhone gibt es Benachrichtigungen, wenn Pandafit auf dem Home-Bildschirm liegt (ab iOS 16.4): unten auf Teilen tippen, dann auf „Zum Home-Bildschirm“, und Pandafit von dort öffnen.';
const PUSH_DENIED = 'Benachrichtigungen sind für Pandafit nicht erlaubt. Du kannst sie in den Einstellungen erlauben und dann im Profil einschalten.';
const PUSH_FAILED = 'Das Einschalten hat gerade nicht geklappt. Versuch es später im Profil nochmal.';

type PushState = { env: PushEnv; on: boolean; busy: boolean; showCard: boolean; enable: () => Promise<void>; disable: () => Promise<void>; closeCard: () => void };

/** One on/off per account and device for both notices. A subscription is sent again at every start, so it follows the login. */
function usePush(env: Env, account: string): { state: PushState | null; msg: string | null } {
  const p = env.push;
  const [on, setOn] = useState(() => env.storage.getItem(pushKey(account)) === 'on');
  const [cardDone, setCardDone] = useState(() => env.storage.getItem(cardKey(account)) === '1');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const getKey = useCallback(async (): Promise<string> => {
    if (key.current) return key.current;
    const res = await get(env, '/push/key');
    const k = res.ok ? ((await res.json()) as { key?: unknown }).key : null;
    if (typeof k !== 'string') throw new Error('no key');
    return (key.current = k);
  }, [env]);
  const send = useCallback(async (s: SubJson) => {
    const res = await post(env, '/push/subscribe', { endpoint: s.endpoint, keys: s.keys });
    if (!res.ok) throw new Error('not stored');
  }, [env]);

  useEffect(() => {
    if (!p || p.support !== 'ok') return;
    void getKey().catch(() => {}); // ready before the tap, so subscribing follows the permission at once
    if (env.storage.getItem(pushKey(account)) === 'on' && p.permission() === 'granted') {
      void (async () => send((await p.current()) ?? (await p.subscribe(await getKey()))))().catch(() => {});
    }
  }, [env, p, account, getKey, send]);

  if (!p) return { state: null, msg };
  const closeCard = () => { env.storage.setItem(cardKey(account), '1'); setCardDone(true); };
  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      if ((await p.requestPermission()) !== 'granted') { setMsg(PUSH_DENIED); return; } // first: iOS asks only during the tap
      await send(await p.subscribe(await getKey()));
      env.storage.setItem(pushKey(account), 'on'); setOn(true);
    } catch { setMsg(PUSH_FAILED); } finally { setBusy(false); closeCard(); }
  };
  const disable = async () => {
    setBusy(true); setMsg(null);
    env.storage.setItem(pushKey(account), 'off'); setOn(false);
    try {
      const endpoint = await p.unsubscribe();
      if (endpoint) await post(env, '/push/unsubscribe', { endpoint });
    } catch { /* the push service answers 410 next time, and the server drops it */ } finally { setBusy(false); }
  };
  const showCard = !cardDone && !on && (p.support === 'install' || (p.support === 'ok' && p.permission() === 'default'));
  return { state: { env: p, on, busy, showCard, enable, disable, closeCard }, msg };
}

function PushCard({ push }: { push: PushState }) {
  return (
    <div className="tk-screen">
      <section className="card" aria-label="Benachrichtigungen einschalten">
        <h2>Benachrichtigungen einschalten</h2>
        {push.env.support === 'install' ? (
          <>
            <p>{PUSH_INSTALL}</p>
            <button type="button" className="ghost" onClick={push.closeCard}>Verstanden</button>
          </>
        ) : (
          <>
            <p>Pandafit sagt dir Bescheid, wenn eine neue Version da ist, wenn dein Essensplan für die Woche kommt und wenn dein Laufplan da ist. Sonst nichts.</p>
            <div className="tk-row">
              <button type="button" disabled={push.busy} onClick={() => void push.enable()}>Einschalten</button>
              <button type="button" className="ghost" onClick={push.closeCard}>Nicht jetzt</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PushSettings({ push }: { push: PushState }) {
  const p = push.env;
  const granted = p.support === 'ok' && p.permission() === 'granted';
  return (
    <section className="card">
      <h2>Benachrichtigungen</h2>
      {p.support === 'install' && <p>{PUSH_INSTALL}</p>}
      {p.support === 'none' && <p className="muted">In diesem Browser gibt es keine Benachrichtigungen.</p>}
      {p.support === 'ok' && (
        <>
          <p className="muted">Nur wenige: wenn eine neue Version da ist, wenn dein Essensplan oder Laufplan für die Woche kommt und wenn der Coach dir schreibt.</p>
          <label className="tk-row">
            <input type="checkbox" role="switch" checked={push.on && granted} disabled={push.busy}
              onChange={(e) => void (e.target.checked ? push.enable() : push.disable())} />
            Benachrichtigungen
          </label>
          {push.on && !granted && <p className="muted">{PUSH_DENIED}</p>}
        </>
      )}
    </section>
  );
}

type Tab = 'heute' | 'coach' | 'training' | 'essen' | 'laufen' | 'statistik' | 'profil';
// At most six tabs: Verlauf lives in Kraft, the profile is the round button at the top right.
const TABS: [Tab, string][] = [['heute', 'Heute'], ['coach', 'Woche'], ['training', 'Kraft'], ['essen', 'Essen'], ['laufen', 'Laufen'], ['statistik', 'Statistik']];

const syncText = (status: 'ok' | 'login' | 'offline', c: { pending: number; lastOkMs: number | null; refused?: number }): string => {
  if (status === 'login') return 'Bitte melde dich neu an, dann wird wieder abgeglichen. Bis dahin bleibt alles auf diesem Gerät.';
  if (status === 'offline') return 'Gerade keine Verbindung. Alles bleibt auf diesem Gerät und geht raus, sobald es wieder geht.';
  if ((c.refused ?? 0) > 0) return 'Ein Eintrag wurde vom Server nicht angenommen. Er bleibt sicher auf diesem Gerät gespeichert.';
  if (c.pending > 0) return c.pending === 1 ? 'Ein Eintrag wartet noch aufs Senden. Er ist sicher auf diesem Gerät.' : `${c.pending} Einträge warten noch aufs Senden. Sie sind sicher auf diesem Gerät.`;
  if (c.lastOkMs === null) return 'Der erste Abgleich folgt gleich.';
  const at = new Date(c.lastOkMs);
  return `Alles abgeglichen, zuletzt ${at.toLocaleDateString('de-DE')} um ${at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}.`;
};

/** The account on this device: who is signed in, how the sync stands, and the way out. */
function Profil({ account, port, now, status, onLogout, push }: { account: string; port: WebPort; now: () => number; status: 'ok' | 'login' | 'offline'; onLogout: () => void; push: PushState | null }) {
  const [confirming, setConfirming] = useState(false);
  usePortRecords(port, 'workout'); // re-renders when the port changes
  const c = port.syncState();
  const tryLogout = () => { if (c.pending > 0 || (c.refused ?? 0) > 0) setConfirming(true); else onLogout(); };
  return (
    <div className="tk-screen">
      <h1 className="tk-title">Profil</h1>
      <section className="card">
        <p className="muted">Angemeldet als</p>
        <h2>{account}</h2>
        <p role="status">{syncText(status, c)}</p>
      </section>
      {push && <PushSettings push={push} />}
      <RunSettingsCard port={port} now={now} />
      {confirming ? (
        <p role="status" className="tk-note">
          Einiges ist noch nicht gesendet. Es bleibt auf diesem Gerät gespeichert und geht beim nächsten Anmelden raus.
          <button type="button" onClick={onLogout}>Trotzdem abmelden</button>
          <button type="button" className="ghost" onClick={() => setConfirming(false)}>Doch nicht</button>
        </p>
      ) : <button type="button" className="ghost" onClick={tryLogout}>Abmelden</button>}
    </div>
  );
}

function Shell({ account, env, port, onLogout, onRelogin }: { account: string; env: Env; port: WebPort; onLogout: () => void; onRelogin: (name: string) => void }) {
  const [tab, setTab] = useState<Tab>(env.startTab === 'essen' ? 'essen' : env.startTab === 'laufen' ? 'laufen' : env.startTab === 'coach' ? 'coach' : 'heute');
  const push = usePush(env, account);
  useEffect(() => env.onOpenTab?.((t) => { if (t === 'essen') setTab('essen'); else if (t === 'laufen') setTab('laufen'); else if (t === 'coach') setTab('coach'); }), [env]);
  const [persistRefused, setPersistRefused] = useState(false);
  const [hint, setHint] = useState(false);
  const [, tick] = useState(0);
  const status = useSyncExternalStore(port.onStatus, port.status);
  const workouts = usePortRecords(port, 'workout').records;
  // Essen only when the Mac sent a plan for this account: the meal plan is off by default.
  const mealRecords = usePortRecords(port, 'mealplan').records;
  const hasMeals = mealWeeks(mealRecords, env.now()).length > 0;
  // Laufen only once the run coach's status says on or suggest: nothing of it for a person who does not run.
  const runRecords = usePortRecords(port, 'run').records;
  const hasRun = runView(runRecords ?? [], env.now()).visible;
  // Statistik once there is a stats record or a finished workout.
  const statsRecords = usePortRecords(port, 'stats').records;
  const hasStats = statsVisible(statsRecords, workouts);
  const tabs = TABS.filter(([t]) => (t !== 'essen' || hasMeals) && (t !== 'laufen' || hasRun) && (t !== 'statistik' || hasStats));
  useEffect(() => { if (tab === 'statistik' && statsRecords !== null && workouts !== null && !hasStats) setTab('heute'); }, [tab, hasStats, statsRecords, workouts]);
  useEffect(() => { if (tab === 'laufen' && runRecords !== null && !hasRun) setTab('heute'); }, [tab, hasRun, runRecords]);
  useEffect(() => { if (tab === 'essen' && mealRecords !== null && !hasMeals) setTab('heute'); }, [tab, hasMeals, mealRecords]);

  // Open on this device: a recent open record, or a store this session has opened or still has unsaved. Unknown until the first read.
  const state: OpenState = workouts === null ? 'unknown'
    : openStoreCount(port) > 0 || workouts.some((r) => (r.body as LoggedWorkout).endMs === null && env.now() - r.updatedMs < OPEN_MAX_AGE_MS) ? 'open' : 'none';
  const lastState = useRef<OpenState | null>(null);
  useEffect(() => { if (lastState.current !== state) { lastState.current = state; env.onWorkoutOpen?.(state); } });
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    void env.persist().then((ok) => {
      // A quiet line on Profil only, as long as the browser refuses; no banner over the other tabs.
      if (!ok) setPersistRefused(true);
    }, () => {});
    if (shouldShowInstallHint({ ua: env.ua, standalone: env.standalone, seen: env.storage.getItem(HINT_KEY) === '1' })) {
      setHint(true);
      env.storage.setItem(HINT_KEY, '1');
    }
    void port.sync();
  }, [env, port]);

  // While typing, the bottom bar steps aside, so the on-screen keyboard never pushes it over a field.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const field = (t: EventTarget | null) => t instanceof HTMLElement && t.matches('input, textarea, select');
    const on = (e: FocusEvent) => { if (field(e.target)) setTyping(true); };
    const off = (e: FocusEvent) => { if (field(e.target) && !field(e.relatedTarget)) setTyping(false); };
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => { document.removeEventListener('focusin', on); document.removeEventListener('focusout', off); };
  }, []);

  return (
    <>
      <main className="web-main" onClick={() => setTimeout(() => tick((n) => n + 1), 50)}>
        <button type="button" className="web-profile" aria-label="Profil" aria-current={tab === 'profil' ? 'page' : undefined} onClick={() => setTab('profil')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        {status === 'login' && (
          <div className="tk-screen">
            <LoginForm env={env}
              note="Bitte melde dich neu an. Alles auf diesem Gerät bleibt erhalten, auch ein offenes Training."
              before={() => port.pause()} failed={() => port.resume()}
              onDone={(n) => { if (n === account) { port.resume(); void port.sync(); } else onRelogin(n); }} />
          </div>
        )}
        {push.state?.showCard && <PushCard push={push.state} />}
        {push.msg && <div className="tk-screen"><p role="status" className="tk-note">{push.msg}</p></div>}
        {hint && !(push.state?.showCard && push.state.env.support === 'install') && <div className="tk-screen"><p role="status" className="tk-note">Tipp: Tippe unten auf Teilen und dann auf „Zum Home-Bildschirm“, dann öffnet sich Pandafit wie eine App.</p></div>}
        <ErrorBoundary key={tab} onTraining={() => setTab('training')}>
          {tab === 'heute' && <Heute port={port} env={env} account={account} goTraining={() => setTab('training')} goRun={hasRun ? () => setTab('laufen') : undefined} goCoach={() => setTab('coach')} />}
          {tab === 'training' && <Training port={port} env={env} />}
          {tab === 'essen' && hasMeals && <MealsScreen port={port} now={env.now} />}
          {tab === 'laufen' && hasRun && <><RunScreen port={port} now={env.now} newId={env.newId} /><RunLookBack port={port} now={env.now} /></>}
          {tab === 'coach' && <CoachScreen port={port} now={env.now} newId={env.newId} />}
          {tab === 'statistik' && hasStats && <StatsScreen port={port} now={env.now} />}
          {tab === 'profil' && <Profil account={account} port={port} now={env.now} status={status} onLogout={onLogout} push={push.state} />}
        </ErrorBoundary>
        {persistRefused && tab === 'profil' && <div className="tk-screen"><p role="status" className="muted">Dein Browser hat dauerhaften Speicher nicht zugesagt. Deine Einträge liegen trotzdem auf dem Gerät und gehen raus, sobald es geht.</p></div>}
      </main>
      <nav aria-label="Seiten" className={`web-nav${typing ? ' web-nav-away' : ''}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(([t, label]) => (
          <button key={t} type="button" aria-current={tab === t ? 'page' : undefined} aria-pressed={tab === t} onClick={() => setTab(t)}>{label}</button>
        ))}
      </nav>
    </>
  );
}

type Phase = { kind: 'loading' } | { kind: 'login' } | { kind: 'offline' } | { kind: 'nostorage' } | { kind: 'storagefail' } | { kind: 'in'; account: string };

const factoryOf = (env: Env): IDBFactory | null => (env.idbFactory === undefined ? (typeof indexedDB === 'undefined' ? null : indexedDB) : env.idbFactory);

/** Lets the unmounted screens flush their last write, waits for it, then stops and closes the port. */
async function retire(p: WebPort): Promise<void> {
  await sleep(0); await sleep(0);
  await p.idle();
  await p.pause();
  p.dispose();
}

export function App({ env }: { env: Env }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [port, setPort] = useState<{ account: string; port: WebPort } | null>(null);
  const portRef = useRef<WebPort | null>(null);
  portRef.current = port?.port ?? null;

  /** Opens the account's local data. Without a usable IndexedDB nothing can be stored, and that is said plainly. */
  const enter = useCallback(async (account: string): Promise<boolean> => {
    const factory = factoryOf(env);
    if (!factory) { setPhase({ kind: 'nostorage' }); return false; }
    env.storage.setItem(ACCOUNT_KEY, account); // so a retry after a failed open still finds the account
    let store;
    try { store = await openIdb(account, factory); } catch { setPhase({ kind: 'storagefail' }); return false; } // may pass; not the same as unavailable
    const old = portRef.current;
    const p = createWebPort({ store, account, fetchFn: env.fetchFn, now: env.now, push: env.push });
    setPort({ account, port: p });
    if (old) void retire(old); // after its screens have unmounted and flushed
    setPhase({ kind: 'in', account });
    return true;
  }, [env]);

  /** Tell the server about a logout that could not be sent while offline. */
  const retryLogout = useCallback(() => {
    void post(env, '/logout', undefined, ME_TIMEOUT_MS).then((res) => { if (loggedOut(res)) env.storage.removeItem(LOGGED_OUT_KEY); }, () => {});
  }, [env]);

  const boot = useCallback(async () => {
    setPhase({ kind: 'loading' });
    if (!factoryOf(env)) { setPhase({ kind: 'nostorage' }); return; }
    if (env.storage.getItem(LOGGED_OUT_KEY) === '1') { retryLogout(); setPhase({ kind: 'login' }); return; }
    // The last account on this device opens at once from its local data; its login is checked in the background.
    const last = env.storage.getItem(ACCOUNT_KEY);
    if (last) { await enter(last); return; } // a failure to open is the storage message
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
    setPort(null); // the screens unmount first and flush what is still typed
    setPhase({ kind: 'login' });
    env.storage.removeItem(ACCOUNT_KEY); // the data stays on the device; the login does not
    if (p) await retire(p);
    try { if (!loggedOut(await post(env, '/logout', undefined, ME_TIMEOUT_MS))) env.storage.setItem(LOGGED_OUT_KEY, '1'); } catch { env.storage.setItem(LOGGED_OUT_KEY, '1'); } // not answered: asked again at the next start
  };

  if (phase.kind === 'loading') return <main className="web-main"><p className="muted tk-screen">Einen Moment …</p></main>;
  if (phase.kind === 'nostorage') return <main className="web-main tk-screen"><p role="status" className="tk-note">{NO_STORAGE}</p></main>;
  if (phase.kind === 'storagefail') return <main className="web-main tk-screen"><p role="status" className="tk-note">{STORAGE_FAILED}</p><button type="button" onClick={() => void boot()}>Nochmal versuchen</button></main>;
  if (phase.kind === 'offline') return <main className="web-main tk-screen"><p role="status" className="tk-note">Keine Verbindung. Zum ersten Anmelden braucht Pandafit kurz Internet.</p><button type="button" onClick={() => void boot()}>Nochmal versuchen</button></main>;
  if (phase.kind === 'login' || !port) return <main className="web-main"><LoginForm env={env} onDone={(n) => void afterLogin(n)} /></main>;
  return <Shell key={port.account} account={port.account} env={env} port={port.port} onLogout={() => void logout()} onRelogin={(n) => void afterLogin(n)} />;
}
