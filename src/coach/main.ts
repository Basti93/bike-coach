import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { originAllowed } from '../service/ws-server';
import { findOpenRides } from '../service/recovery';
import type { Profile } from '../shared/profiles';
import { COACH_PORT, type CoachClientMessage, type CoachServerMessage } from '../shared/coach-protocol';
import { askClaude, findClaude } from './claude-client';
import { Coach } from './coach';
import { suggestProfile } from '../shared/garmin-profile';
import { GarminLink } from './garmin';
import { GarminDb } from './garmin-db';
import { healthData } from './garmin-health';
import { readinessFrom, type GarminCoachData } from './readiness';
import { GarminSync } from './garmin-sync';
import { HevyLinks } from './hevy';
import { activityName, canUpload, REPO_DESCRIPTION } from './garmin-upload';
import { GarminUploader } from './garmin-uploader';
import { computeTogether } from './together';
import type { CoachState } from './state';
import { GymCoach } from './gym/gym-coach';
import { HevyRoutines } from './gym/hevy-routines';
import { gymPublic } from './gym/public';

const dir = process.env.BIKE_DATA_DIR;
const coachDir = process.env.BIKE_COACH_DIR;
if (!dir || !coachDir) throw new Error('BIKE_DATA_DIR und BIKE_COACH_DIR fehlen');
const port = Number(process.env.BIKE_COACH_PORT ?? COACH_PORT);
const SCAN_MS = Number(process.env.BIKE_COACH_SCAN_MS ?? 10_000);
const WAIT_MS = Number(process.env.BIKE_COACH_WAIT_MS ?? 5 * 60_000);
const RETRY_MS = 30 * 60_000;
const workDir = path.join(coachDir, 'work');
fs.mkdirSync(workDir, { recursive: true });

const GARMIN_CACHE_MS = 5 * 60_000;
const GARMIN_DAYS = 60;
const garminCache = new Map<string, { atMs: number; data: GarminCoachData | null }>();
const garminData = (profileId: string): GarminCoachData | null => {
  if (!/^[A-Za-z0-9-]+$/.test(profileId)) return null;
  const now = Date.now();
  const cached = garminCache.get(profileId);
  if (cached && now - cached.atMs < GARMIN_CACHE_MS) return cached.data;
  const db = new GarminDb(path.join(dir, '..', 'garmin', 'data', profileId, 'garmin.db'));
  const activities = db.activities(0);
  const days = db.days(new Date(now - GARMIN_DAYS * 86_400_000).toISOString().slice(0, 10));
  const data = activities.length || days.length ? { activities, days, body: db.body() } : null;
  garminCache.set(profileId, { atMs: now, data });
  return data;
};

// Optional and per profile: without a key nothing happens.
const hevy = new HevyLinks({ baseDir: path.join(dir, '..', 'hevy'), nowMs: () => Date.now(), onChange: (profileId) => { try { coach.strengthChanged(profileId); } catch { /* unknown profile */ } } });

const coach = new Coach({
  ridesDir: dir, coachDir, nowMs: () => Date.now(), garmin: garminData,
  strength: (profileId) => hevy.workouts(profileId),
  ask: async (input) => askClaude({ ...input, workDir, bin: process.env.BIKE_CLAUDE_BIN ?? (await findClaude()) }),
});

const hevyDir = path.join(dir, '..', 'hevy');
const gymConnected = (profileId: string): boolean => hevy.status(profileId).state === 'connected';
// Built fresh per use, never kept: a disconnected profile has no key and so no writer.
const gymWriter = (profileId: string): HevyRoutines | null => {
  const key = hevy.apiKey(profileId);
  return key ? new HevyRoutines({ key, dir: path.join(hevyDir, profileId), nowMs: () => Date.now() }) : null;
};
const gym = new GymCoach({
  dir: path.join(coachDir, 'gym'), nowMs: () => Date.now(),
  ask: async (input) => askClaude({ ...input, workDir, bin: process.env.BIKE_CLAUDE_BIN ?? (await findClaude()) }),
  workouts: (id) => hevy.workouts(id),
  templates: async (id) => { const w = gymWriter(id); return w ? w.templates() : []; },
  ready: (id) => gymConnected(id) && hevy.strengthReady(id),
  bike: (id) => { const s = coach.state(id); return { summaries: s.summaries, complaints: s.complaints ?? [] }; },
  complaint: (id, text) => coach.addComplaintFromText(id, text),
  writer: gymWriter,
});
const gymOf = (profileId: string) => {
  try { return gymPublic(hevy.status(profileId), gym.state(profileId), gym.isThinking(profileId), gymConnected(profileId) && hevy.strengthReady(profileId)); } catch { return null; }
};

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

const garminDir = path.join(dir, '..', 'garmin');
const garmin = new GarminLink({
  baseDir: garminDir,
  python: path.join(garminDir, 'venv', 'bin', 'python'),
  script: process.env.BIKE_GARMIN_SCRIPT ?? path.resolve('scripts', 'garmin', 'bridge.py'),
  onUpdate: () => publish(),
});

const garminSync = new GarminSync({
  baseDir: garminDir,
  python: path.join(garminDir, 'venv', 'bin', 'python'),
  script: path.join(path.dirname(process.env.BIKE_GARMIN_SCRIPT ?? path.resolve('scripts', 'garmin', 'bridge.py')), 'garmin_sync.py'),
  rideOpen: () => !noOpenRide(),
  onUpdate: () => publish(),
  nowMs: () => Date.now(),
});

const http = createServer();
const wss = new WebSocketServer({
  server: http,
  verifyClient: originAllowed(process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : undefined),
});
const subs = new Map<WebSocket, string>();
const lastSent = new Map<WebSocket, string>();
const together = () => {
  const all = profiles();
  return computeTogether(all, all.flatMap((p) => { try { return [coach.state(p.id)]; } catch { return []; } }), Date.now());
};
const readinessOf = (profileId: string) => {
  try {
    const data = garminData(profileId);
    return data ? readinessFrom(data, coach.state(profileId).summaries, Date.now()) : null;
  } catch { return null; }
};
const suggestionOf = (profileId: string) => {
  try {
    const data = garminData(profileId);
    return data?.body ? suggestProfile(data.body, data.activities, Date.now()) : null;
  } catch { return null; }
};
const healthOf = (profileId: string, rangeDays: number | null) => {
  if (!/^[A-Za-z0-9-]+$/.test(profileId)) throw new Error('Ungültiges Profil');
  const now = Date.now();
  const db = new GarminDb(path.join(dir, '..', 'garmin', 'data', profileId, 'garmin.db'));
  coach.scanRides(profiles());
  const state = coach.state(profileId);
  const rated = state.summaries.flatMap((r) => { const rating = state.feedback[r.rideId]; return rating ? [{ startedAtMs: r.startedAtMs, rating }] : []; });
  const from = rangeDays === null ? '0000-01-01' : new Date(now - rangeDays * 86_400_000).toISOString().slice(0, 10);
  return healthData({ days: db.days(from), activities: db.activities(0), progress: db.progress(new Date(now).toISOString().slice(0, 10)), rated }, rangeDays, now);
};
const publish = (): void => {
  for (const [socket, profileId] of subs) {
    try {
      const body = JSON.stringify({ type: 'coach-state', state: coach.state(profileId), thinking: coach.isThinking(profileId), hevy: hevy.status(profileId), debriefing: coach.isDebriefing(profileId), together: together(), garmin: garmin.status(profileId), garminSync: garminSync.info(profileId), garminReadiness: readinessOf(profileId), garminSuggestion: suggestionOf(profileId), gym: gymOf(profileId) });
      if (lastSent.get(socket) !== body) { socket.send(body); lastSent.set(socket, body); }
    } catch { /* profile or connection gone */ }
  }
};
const refresh = (profileId: string): void => {
  void coach.refresh(profileId).catch(() => {}).finally(publish);
  publish();
};
const noOpenRide = (): boolean => findOpenRides(dir).length === 0;
const uploader = new GarminUploader({
  baseDir: garminDir,
  python: path.join(garminDir, 'venv', 'bin', 'python'),
  script: path.join(path.dirname(process.env.BIKE_GARMIN_SCRIPT ?? path.resolve('scripts', 'garmin', 'bridge.py')), 'garmin_upload.py'),
  exportsDir: path.join(dir, 'exports'),
  rideOpen: () => !noOpenRide(),
  hasTokens: (profileId) => fs.existsSync(path.join(garminDir, 'tokens', profileId, 'garmin_tokens.json')),
  onResult: (profileId, rideId, result) => { coach.markUpload(profileId, rideId, result); publish(); },
});
const startUpload = (profileId: string, rideId: string, repoLink: boolean): void => {
  const s = coach.state(profileId);
  const ride = s.summaries.find((r) => r.rideId === rideId);
  if (ride && canUpload(s, rideId) && uploader.upload(profileId, rideId, activityName(ride), ride.startedAtMs, repoLink ? REPO_DESCRIPTION : undefined)) coach.markUpload(profileId, rideId, { status: 'uploading' });
};

const handleGym = (socket: WebSocket, m: CoachClientMessage): void => {
  const send = (msg: CoachServerMessage) => { try { socket.send(JSON.stringify(msg)); } catch { /* connection gone */ } };
  if (m.type === 'gym-forget') { gym.forget(m.profileId); publish(); return; }
  if (!('profileId' in m) || !gymConnected(m.profileId)) {
    if (m.type === 'gym-preview') send({ type: 'gym-preview', preview: null });
    if (m.type === 'gym-confirm') send({ type: 'gym-confirm-result', result: 'failed' });
    return;
  }
  // Hevy is only read or written with no ride open.
  if (m.type === 'gym-preview') {
    if (!noOpenRide()) { send({ type: 'gym-preview', preview: null }); return; }
    void gym.preview(m.profileId).catch(() => null).then((preview) => send({ type: 'gym-preview', preview }));
    return;
  }
  if (m.type === 'gym-confirm') {
    if (!noOpenRide()) { send({ type: 'gym-confirm-result', result: 'failed' }); return; }
    void gym.confirm(m.profileId, m.name).catch((): 'failed' => 'failed').then((result) => { send({ type: 'gym-confirm-result', result }); publish(); });
    return;
  }
  if (m.type === 'gym-adjust') gym.adjust(m.profileId, m.how);
  if (m.type === 'gym-note') gym.note(m.profileId, m.text);
  if (m.type === 'gym-answer') gym.answer(m.profileId, m.question, m.text);
  if (m.type === 'gym-skip-question') gym.skipQuestion(m.profileId, m.question);
  if (m.type === 'gym-remove-rule') gym.removeRule(m.profileId, m.atMs);
  publish();
};

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const m = JSON.parse(String(raw)) as CoachClientMessage;
      // Login credentials are only passed on, never stored or sent back.
      // The key is only passed on and stored privately, never sent back.
      if (m.type === 'hevy-connect') { void hevy.connect(m.profileId, m.key).catch(() => {}).finally(publish); publish(); return; }
      if (m.type === 'hevy-disconnect') { hevy.disconnect(m.profileId); publish(); return; }
      if (m.type === 'garmin-login') { garmin.login(m.profileId, m.email, m.password); return; }
      if (m.type === 'garmin-mfa') { garmin.mfa(m.profileId, m.code); return; }
      if (m.type === 'garmin-disconnect') { garmin.disconnect(m.profileId); try { coach.garminDisconnected(m.profileId); } catch { /* unknown profile */ } publish(); return; }
      if (m.type === 'garmin-health') { socket.send(JSON.stringify({ type: 'garmin-health', data: healthOf(m.profileId, m.rangeDays) })); return; }
      if (m.type.startsWith('gym-')) { handleGym(socket, m); return; }
      coach.scanRides(profiles());
      if (m.type === 'subscribe') subs.set(socket, m.profileId);
      if (m.type === 'feedback') { coach.feedback(m.profileId, m.rideId, m.rating); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'skip-feedback') { coach.skipFeedback(m.profileId); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'note') { coach.note(m.profileId, m.text); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'complaint-update') { coach.updateComplaint(m.profileId, m.id, m.status); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'answer-question') { coach.answerQuestion(m.profileId, m.questionId, m.text); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'skip-question') coach.skipQuestion(m.profileId);
      if (m.type === 'debrief-seen') coach.debriefSeen(m.profileId);
      if (m.type === 'garmin-upload-settings') coach.setUploadMode(m.profileId, m.mode === 'off' ? 'off' : 'ask');
      if (m.type === 'garmin-upload') startUpload(m.profileId, m.rideId, m.repoLink === true);
      if (m.type === 'debrief-answer') { coach.answerDebrief(m.profileId, m.rideId, m.question, m.text); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'debrief-skip-question') coach.skipDebriefQuestion(m.profileId, m.rideId, m.question);
      if (m.type === 'remove-motive') { coach.removeMotive(m.profileId, m.atMs); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'set-ftp' && m.ftpW >= 50) { coach.setFtp(m.profileId, m.ftpW); if (noOpenRide()) refresh(m.profileId); }
      if (m.type === 'adjust') coach.adjustNext(m.profileId, m.how);
      if (m.type === 'skip-ramp') coach.skipRamp(m.profileId);
      if (m.type === 'ride-detail') {
        const detail = coach.rideDetail(m.profileId, m.rideId);
        if (detail) socket.send(JSON.stringify({ type: 'ride-detail', detail }));
      }
      if (m.type === 'remove-rule') coach.removeRule(m.profileId, m.atMs);
      if (m.type === 'word-result') coach.wordResult(m.profileId, m.nl, m.knew);
      if (m.type === 'pass-select') coach.passSelect(m.profileId, m.passId);
      if (m.type === 'pass-progress') coach.passProgress(m.profileId, m.passId, m.distanceM);
      if (m.type === 'pass-summit') coach.passSummit(m.profileId, m.passId);
      publish();
    } catch { /* ignore invalid message */ }
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
      if (free && !coach.isThinking(p.id)) void coach.ensureDebrief(p.id).catch(() => {}).finally(publish);
      if (!free || !s.dirty || coach.isThinking(p.id)) continue;
      const waited = now - (s.dirtySinceMs ?? now) >= WAIT_MS;
      if (s.awaitingFeedback && !waited) continue;
      if (s.lastError && s.lastAttemptMs && now - s.lastAttemptMs < RETRY_MS) continue;
      refresh(p.id);
    }
    // Separate safeguard: Hevy must never disturb the coach run or a ride.
    if (free) void hevy.tick(list.map((p) => p.id)).catch(() => {}).finally(publish);
    // Separate safeguard: the gym coach must never disturb the bike coach or a ride, and runs with no ride open only.
    if (free) for (const p of list) { try { void gym.tick(p.id).catch(() => {}).finally(publish); } catch { /* try again on the next run */ } }
    // Separate safeguard: the fetch must never disturb the coach run.
    for (const p of list) { try { garminSync.tick(p.id); } catch { /* try again on the next run */ } }
    publish();
  } catch (e) {
    console.error('Coach-Lauf fehlgeschlagen', e);
  }
};
setInterval(scan, SCAN_MS);
http.on('error', () => setTimeout(() => http.listen(port, '127.0.0.1'), 2000));
http.once('listening', () => { scan(); process.stdout.write('ready\n'); });
http.listen(port, '127.0.0.1');
