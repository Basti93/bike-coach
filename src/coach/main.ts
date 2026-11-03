import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { originAllowed } from '../service/ws-server';
import { findOpenRides } from '../service/recovery';
import type { Profile } from '../shared/profiles';
import { COACH_PORT, type CoachClientMessage, type CoachHome, type CoachServerMessage } from '../shared/coach-protocol';
import { askClaude, findClaude } from './claude-client';
import { computeTogether } from './together';
import type { CoachState } from './state';
import { AccountLinks } from './tracking/link';
import { createCoachRuntime } from './runtime';
import { coachHttp, type CoachHttp } from './remote/coach-http';
import { homeOf, markMealsMoved, mealFile, mealsDue } from './remote/home';
import { migrate } from './remote/migrate';
import { RemoteCoach, ruleFallback } from './remote/remote-coach';
import { RideUploads } from './remote/ride-upload';
import { createRouter, mealsStayLocal } from './remote/router';

const dir = process.env.BIKE_DATA_DIR;
const coachDir = process.env.BIKE_COACH_DIR;
if (!dir || !coachDir) throw new Error('BIKE_DATA_DIR und BIKE_COACH_DIR fehlen');
const port = Number(process.env.BIKE_COACH_PORT ?? COACH_PORT);
const SCAN_MS = Number(process.env.BIKE_COACH_SCAN_MS ?? 10_000);
const WAIT_MS = Number(process.env.BIKE_COACH_WAIT_MS ?? 5 * 60_000);
const workDir = path.join(coachDir, 'work');
fs.mkdirSync(workDir, { recursive: true });
// The runtime keeps rides/, coach/, garmin/, hevy/ and accounts/ side by side, as the Mac always has.
const root = path.dirname(dir);

const profiles = (): Profile[] => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'profiles.json'), 'utf8')) as Profile[]; } catch { return []; }
};

const config = (): { syncUrl?: string; syncToken?: string } => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, '..', 'config.json'), 'utf8')); } catch { return {}; }
};
const syncUrl = process.env.BIKE_SYNC_URL ?? config().syncUrl;
const syncToken = process.env.BIKE_SYNC_TOKEN ?? config().syncToken;
const lastSynced = new Map<string, string>();
const pushToServer = (s: CoachState): void => {
  if (!syncUrl || !syncToken) return;
  const body = JSON.stringify(s);
  if (lastSynced.get(s.profileId) === body) return;
  fetch(`${syncUrl}/profiles/${encodeURIComponent(s.profileId)}/coach`, {
    method: 'PUT', body, headers: { authorization: `Bearer ${syncToken}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
  }).then((r) => { if (r.ok) lastSynced.set(s.profileId, body); }).catch(() => { /* try again on the next run */ });
};

// Optional and per profile: without a link nothing is sent.
const links = new AccountLinks({ dir: path.join(root, 'accounts') });
const coachRoot = path.join(root, 'coach');
/** A linked profile whose move finished is coached by the server; every other profile here, exactly as before. */
const onServer = (id: string): boolean => homeOf(coachRoot, id, links.status(id).state !== 'idle') === 'server';
const noOpenRide = (): boolean => findOpenRides(dir).length === 0;
const mealsLocal = (): boolean => mealsStayLocal(coachRoot);

const remotes = new Map<string, RemoteCoach>();
/** The server coach of a moved profile, started on first use; stopped once the profile is coached here again. */
const remote = (id: string): RemoteCoach | null => {
  let r = remotes.get(id) ?? null;
  if (!onServer(id)) {
    if (r) { r.stop(); remotes.delete(id); }
    return null;
  }
  if (!r) {
    r = new RemoteCoach({
      dir: path.join(coachRoot, 'remote', id), profileId: id,
      url: () => links.url(id), token: () => links.token(id), reject: () => links.reject(id),
      // Nothing goes to the server while a ride is open.
      mayWrite: noOpenRide,
      fallback: () => ruleFallback(coachRoot, id, profiles().find((p) => p.id === id)?.ftpW ?? 200, Date.now()),
      nowMs: () => Date.now(),
      onMessage: (m) => fromServer(id, m),
    });
    remotes.set(id, r);
    r.start();
  }
  return r;
};
/** The cached server state of a moved profile, once there is one. */
const cachedState = (id: string): CoachState | null => {
  const r = remote(id);
  return r && r.status().sinceMs !== null ? r.view().state : null;
};

const runtime = createCoachRuntime({
  root, profiles, waitMs: WAIT_MS,
  noOpenRide,
  scheduled: () => true,
  ask: async (input) => askClaude({ ...input, workDir, bin: process.env.BIKE_CLAUDE_BIN ?? (await findClaude()) }),
  python: path.join(root, 'garmin', 'venv', 'bin', 'python'),
  garminScripts: path.dirname(process.env.BIKE_GARMIN_SCRIPT ?? path.resolve('scripts', 'garmin', 'bridge.py')),
  links,
  meals: 'own',
  coachHere: (id) => !onServer(id),
  mealsHere: mealsLocal,
  together: () => {
    const all = profiles();
    return computeTogether(all, all.flatMap((p) => { const s = runtime.coachState(p.id) ?? cachedState(p.id); return s ? [s] : []; }), Date.now());
  },
  legacyPush: pushToServer,
});

// ---- After the ride: uploads of a moved profile's rides, the move of a linked one, the meal plan once everyone moved ----

/** The server coach's routes for a linked profile; null without a link or once the server refused it. */
const httpOf = (id: string): CoachHttp | null => {
  const url = links.url(id), token = links.token(id);
  return url && token ? coachHttp({ url, token, reject: () => links.reject(id) }) : null;
};
const uploads = new RideUploads({ ridesDir: dir, dir: coachRoot, http: httpOf, noOpenRide });
/** How a local profile's move stands, for its view. */
const moving = new Map<string, CoachHome>();
/** When a profile's move may be tried again after a failure or a refusal. */
const moveAgainMs = new Map<string, number>();
const MOVE_RETRY_MS = 60_000;
const REFUSED_RETRY_MS = 60 * 60_000;
let job: Promise<void> | null = null;

const moveOne = async (id: string, http: CoachHttp): Promise<void> => {
  moving.set(id, { where: 'moving', done: 0, total: 0, problem: null });
  publish();
  const out = await migrate({
    root, profileId: id, http, uploads, noOpenRide,
    recordsSettled: () => runtime.accountSync.settled(id),
    progress: (done, total) => { moving.set(id, { where: 'moving', done, total, problem: null }); publish(); },
  });
  const was = moving.get(id);
  const at = { done: was?.where === 'moving' ? was.done : 0, total: was?.where === 'moving' ? was.total : 0 };
  if (out.state === 'done') moving.delete(id);
  else if (out.state === 'refused') { moving.set(id, { where: 'moving', ...at, problem: 'other-profile' }); moveAgainMs.set(id, Date.now() + REFUSED_RETRY_MS); }
  else if (out.state === 'failed') { moving.set(id, { where: 'moving', ...at, problem: 'offline' }); moveAgainMs.set(id, Date.now() + MOVE_RETRY_MS); }
  publish();
};

/** The household's meal file goes up through one moved profile, once everyone it counts has moved. */
const moveMeals = async (): Promise<void> => {
  const ids = profiles().map((p) => p.id);
  if (!mealsDue(coachRoot, ids, onServer)) return;
  const via = ids.find((id) => onServer(id));
  const http = via ? httpOf(via) : null;
  if (!http) return;
  let file = mealFile(coachRoot);
  if (!fs.existsSync(file)) {
    // No meal plan here yet: the server's starts empty.
    file = path.join(coachRoot, 'remote', 'meals-empty.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{}');
  }
  await http.meals(file);
  markMealsMoved(coachRoot, Date.now());
  publish();
};

/** One job at a time, only with no ride open: a move, a profile's ride uploads or the meal plan. */
const afterRide = (): void => {
  if (job || !noOpenRide()) return;
  job = (async () => {
    for (const p of profiles()) {
      if (!noOpenRide()) return;
      if (onServer(p.id)) { await uploads.tick(p.id); continue; }
      if (links.status(p.id).state !== 'linked' || (moveAgainMs.get(p.id) ?? 0) > Date.now()) continue;
      const http = httpOf(p.id);
      if (http) await moveOne(p.id, http);
    }
    if (noOpenRide()) await moveMeals();
  })().catch(() => { /* the next scan tries again */ }).finally(() => { job = null; });
};
// A profile that is no longer linked shows no move.
const movingOf = (id: string): CoachHome | null => (links.status(id).state === 'idle' ? null : moving.get(id) ?? null);

const router = createRouter({ local: runtime, remote, mealsLocal, togetherLocal: () => profiles().some((p) => !onServer(p.id)), coachDir: coachRoot, moving: movingOf });

const http = createServer();
const wss = new WebSocketServer({
  server: http,
  verifyClient: originAllowed(process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : undefined),
});
const subs = new Map<WebSocket, string>();
const lastSent = new Map<WebSocket, string>();
/** A view goes out only when it changed since the last one on this connection. */
const sendView = (socket: WebSocket, view: CoachServerMessage | null): void => {
  if (!view) return;
  try {
    const body = JSON.stringify(view);
    if (lastSent.get(socket) !== body) { socket.send(body); lastSent.set(socket, body); }
  } catch { /* connection gone */ }
};
function publish(): void { for (const [socket, profileId] of subs) sendView(socket, router.view(profileId)); }
const recordsChanged = (profileId: string): void => {
  const note = JSON.stringify({ type: 'records-changed', profileId } satisfies CoachServerMessage);
  for (const [other, id] of subs) if (id === profileId) { try { other.send(note); } catch { /* connection gone */ } }
};
runtime.onChange((profileId) => {
  if (profileId) recordsChanged(profileId);
  publish();
});
/** From a moved profile's server coach: a new view, or the answer to a request made through the router. */
function fromServer(profileId: string, m: CoachServerMessage): void {
  if (m.type === 'coach-state') { publish(); return; }
  if (m.type === 'records-changed') { recordsChanged(profileId); return; }
  router.answered(profileId, m);
}

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const m = JSON.parse(String(raw)) as CoachClientMessage;
      if (m.type === 'subscribe') subs.set(socket, m.profileId);
      router.handle(m, (msg) => {
        if (msg.type === 'coach-state') { sendView(socket, msg); return; }
        try { socket.send(JSON.stringify(msg)); } catch { /* connection gone */ }
      });
    } catch { /* ignore invalid message */ }
  });
  socket.on('close', () => { subs.delete(socket); lastSent.delete(socket); });
  socket.on('error', () => { subs.delete(socket); lastSent.delete(socket); });
});

/** Starts the server coach of a profile that moved, stops the one of a profile that came back. */
const followHomes = (): void => {
  for (const p of profiles()) remote(p.id);
  for (const id of remotes.keys()) if (!profiles().some((p) => p.id === id)) { remotes.get(id)?.stop(); remotes.delete(id); }
};
const tick = (): void => {
  try { followHomes(); } catch { /* the next run tries again */ }
  runtime.scan();
  try { afterRide(); } catch { /* the next run tries again */ }
};
setInterval(tick, SCAN_MS);
http.on('error', () => setTimeout(() => http.listen(port, '127.0.0.1'), 2000));
http.once('listening', () => { tick(); process.stdout.write('ready\n'); });
http.listen(port, '127.0.0.1');
