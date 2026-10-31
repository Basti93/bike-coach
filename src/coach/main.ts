import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { originAllowed } from '../service/ws-server';
import { findOpenRides } from '../service/recovery';
import type { Profile } from '../shared/profiles';
import { COACH_PORT, type CoachClientMessage } from '../shared/coach-protocol';
import { askClaude, findClaude } from './claude-client';
import { Coach } from './coach';
import type { CoachState } from './state';

const dir = process.env.BIKE_DATA_DIR;
const coachDir = process.env.BIKE_COACH_DIR;
if (!dir || !coachDir) throw new Error('BIKE_DATA_DIR und BIKE_COACH_DIR fehlen');
const port = Number(process.env.BIKE_COACH_PORT ?? COACH_PORT);
const SCAN_MS = Number(process.env.BIKE_COACH_SCAN_MS ?? 10_000);
const WAIT_MS = Number(process.env.BIKE_COACH_WAIT_MS ?? 5 * 60_000);
const RETRY_MS = 30 * 60_000;
const workDir = path.join(coachDir, 'work');
fs.mkdirSync(workDir, { recursive: true });

const coach = new Coach({
  ridesDir: dir, coachDir, nowMs: () => Date.now(),
  ask: async (input) => askClaude({ ...input, workDir, bin: process.env.BIKE_CLAUDE_BIN ?? (await findClaude()) }),
});

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
  }).then((r) => { if (r.ok) lastSynced.set(s.profileId, body); }).catch(() => { /* beim nächsten Lauf erneut */ });
};

const http = createServer();
const wss = new WebSocketServer({
  server: http,
  verifyClient: originAllowed(process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : undefined),
});
const subs = new Map<WebSocket, string>();
const lastSent = new Map<WebSocket, string>();
const publish = (): void => {
  for (const [socket, profileId] of subs) {
    try {
      const body = JSON.stringify({ type: 'coach-state', state: coach.state(profileId), thinking: coach.isThinking(profileId) });
      if (lastSent.get(socket) !== body) { socket.send(body); lastSent.set(socket, body); }
    } catch { /* Profil oder Verbindung weg */ }
  }
};
const refresh = (profileId: string): void => {
  void coach.refresh(profileId).catch(() => {}).finally(publish);
  publish();
};
const noOpenRide = (): boolean => findOpenRides(dir).length === 0;

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const m = JSON.parse(String(raw)) as CoachClientMessage;
      coach.scanRides(profiles());
      if (m.type === 'subscribe') subs.set(socket, m.profileId);
      if (m.type === 'feedback') { coach.feedback(m.profileId, m.rideId, m.rating); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'skip-feedback') { coach.skipFeedback(m.profileId); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'note') { coach.note(m.profileId, m.text); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'adjust') coach.adjustNext(m.profileId, m.how);
      if (m.type === 'skip-ramp') coach.skipRamp(m.profileId);
      if (m.type === 'remove-rule') coach.removeRule(m.profileId, m.atMs);
      publish();
    } catch { /* ungültige Nachricht ignorieren */ }
  });
  socket.on('close', () => { subs.delete(socket); lastSent.delete(socket); });
  socket.on('error', () => { subs.delete(socket); lastSent.delete(socket); });
});

const scan = (): void => {
  try {
    const list = profiles();
    coach.scanRides(list);
    const free = noOpenRide();
    const now = Date.now();
    for (const p of list) {
      const s = coach.state(p.id);
      pushToServer(s);
      if (!free || !s.dirty || coach.isThinking(p.id)) continue;
      const waited = now - (s.dirtySinceMs ?? now) >= WAIT_MS;
      if (s.awaitingFeedback && !waited) continue;
      if (s.lastError && s.lastAttemptMs && now - s.lastAttemptMs < RETRY_MS) continue;
      refresh(p.id);
    }
    publish();
  } catch (e) {
    console.error('Coach-Lauf fehlgeschlagen', e);
  }
};
setInterval(scan, SCAN_MS);
http.on('error', () => setTimeout(() => http.listen(port, '127.0.0.1'), 2000));
http.once('listening', () => { scan(); process.stdout.write('ready\n'); });
http.listen(port, '127.0.0.1');
