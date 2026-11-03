import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { originAllowed } from '../service/ws-server';
import { findOpenRides } from '../service/recovery';
import type { Profile } from '../shared/profiles';
import { COACH_PORT, type CoachClientMessage, type CoachServerMessage } from '../shared/coach-protocol';
import { askClaude, findClaude } from './claude-client';
import { computeTogether } from './together';
import type { CoachState } from './state';
import { AccountLinks } from './tracking/link';
import { createCoachRuntime } from './runtime';

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

const runtime = createCoachRuntime({
  root, profiles, waitMs: WAIT_MS,
  noOpenRide: () => findOpenRides(dir).length === 0,
  scheduled: () => true,
  ask: async (input) => askClaude({ ...input, workDir, bin: process.env.BIKE_CLAUDE_BIN ?? (await findClaude()) }),
  python: path.join(root, 'garmin', 'venv', 'bin', 'python'),
  garminScripts: path.dirname(process.env.BIKE_GARMIN_SCRIPT ?? path.resolve('scripts', 'garmin', 'bridge.py')),
  // Optional and per profile: without a link nothing is sent.
  links: new AccountLinks({ dir: path.join(root, 'accounts') }),
  meals: 'own',
  together: () => {
    const all = profiles();
    return computeTogether(all, all.flatMap((p) => { const s = runtime.coachState(p.id); return s ? [s] : []; }), Date.now());
  },
  legacyPush: pushToServer,
});

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
const publish = (): void => { for (const [socket, profileId] of subs) sendView(socket, runtime.view(profileId)); };
runtime.onChange((profileId) => {
  if (profileId) {
    const note = JSON.stringify({ type: 'records-changed', profileId } satisfies CoachServerMessage);
    for (const [other, id] of subs) if (id === profileId) { try { other.send(note); } catch { /* connection gone */ } }
  }
  publish();
});

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const m = JSON.parse(String(raw)) as CoachClientMessage;
      if (m.type === 'subscribe') subs.set(socket, m.profileId);
      runtime.handle(m, (msg) => {
        if (msg.type === 'coach-state') { sendView(socket, msg); return; }
        try { socket.send(JSON.stringify(msg)); } catch { /* connection gone */ }
      });
    } catch { /* ignore invalid message */ }
  });
  socket.on('close', () => { subs.delete(socket); lastSent.delete(socket); });
  socket.on('error', () => { subs.delete(socket); lastSent.delete(socket); });
});

setInterval(runtime.scan, SCAN_MS);
http.on('error', () => setTimeout(() => http.listen(port, '127.0.0.1'), 2000));
http.once('listening', () => { runtime.scan(); process.stdout.write('ready\n'); });
http.listen(port, '127.0.0.1');
